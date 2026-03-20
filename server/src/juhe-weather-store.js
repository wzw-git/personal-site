/**
 * 聚合天气：持久化缓存 + 每日上游调用上限（免费版 50 次/日）
 * 状态文件放在 UPLOAD_DIR（Docker 下通常已挂载，重启不丢计数）
 */
const fsp = require("fs").promises;
const path = require("path");

/** 中国日历日 YYYY-MM-DD（与常见「按日额度」对齐） */
function calendarDateChina() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * @param {string} uploadDir
 * @returns {string}
 */
function stateFilePath(uploadDir) {
  return path.join(uploadDir, ".weather-api-state.json");
}

/** 串行化读写，避免并发写坏 JSON */
let chain = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function locked(fn) {
  const run = chain.then(() => fn());
  chain = run.catch(() => {});
  return run;
}

/**
 * @param {string} fp
 * @returns {Promise<{ date: string; calls: number; cities: Record<string, { at: number; payload: object }> }>}
 */
async function readState(fp) {
  try {
    const raw = await fsp.readFile(fp, "utf8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") throw new Error("bad");
    return {
      date: typeof j.date === "string" ? j.date : "",
      calls: Number.isFinite(j.calls) ? j.calls : 0,
      cities:
        j.cities && typeof j.cities === "object" ? j.cities : {},
    };
  } catch {
    return { date: "", calls: 0, cities: {} };
  }
}

/**
 * @param {string} fp
 * @param {object} state
 */
async function writeStateAtomic(fp, state) {
  const dir = path.dirname(fp);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(state), "utf8");
  await fsp.rename(tmp, fp);
}

/**
 * @param {object} j 聚合接口 JSON
 * @param {string} city
 */
function payloadFromJuheJson(j, city) {
  const rt = j.result?.realtime;
  return {
    ok: true,
    city: j.result?.city || city,
    temperature: rt?.temperature != null ? String(rt.temperature) : null,
    info: rt?.info != null ? String(rt.info) : null,
    humidity: rt?.humidity != null ? String(rt.humidity) : null,
    aqi: rt?.aqi != null ? String(rt.aqi) : null,
  };
}

/**
 * @param {{
 *   uploadDir: string;
 *   apiKey: string;
 *   city: string;
 *   ttlMs: number;
 *   dailyLimit: number;
 * }} opts
 * @returns {Promise<
 *   | { ok: true; payload: object; hit: "cache" | "live" | "stale" }
 *   | { ok: false; status: number; error: string }
 * >}
 */
async function resolveClimate(opts) {
  const { uploadDir, apiKey, city, ttlMs, dailyLimit } = opts;
  const fp = stateFilePath(uploadDir);
  const now = Date.now();
  const today = calendarDateChina();

  return locked(async () => {
    let state = await readState(fp);
    if (state.date !== today) {
      state = { date: today, calls: 0, cities: state.cities || {} };
    }

    const ent = state.cities[city];
    if (ent && ent.payload && now - ent.at < ttlMs) {
      return { ok: true, payload: ent.payload, hit: "cache" };
    }

    if (state.calls >= dailyLimit) {
      if (ent && ent.payload) {
        return { ok: true, payload: ent.payload, hit: "stale" };
      }
      return {
        ok: false,
        status: 503,
        error: "今日天气数据更新次数已达上限，请明日再试或稍候重试",
      };
    }

    const url = new URL("https://apis.juhe.cn/simpleWeather/query");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("city", city);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25_000);
    try {
      const r = await fetch(url, { signal: ac.signal });
      const j = await r.json();
      const errN = j.error_code != null ? Number(j.error_code) : NaN;
      const hasLive = j.result?.realtime != null && j.result?.city;
      const apiOk = hasLive || (Number.isFinite(errN) && errN === 0);
      if (!apiOk) {
        if (ent && ent.payload) {
          return { ok: true, payload: ent.payload, hit: "stale" };
        }
        return {
          ok: false,
          status: 502,
          error: j.reason || "天气接口返回错误",
        };
      }

      const out = payloadFromJuheJson(j, city);
      const newState = {
        date: today,
        calls: state.calls + 1,
        cities: { ...state.cities, [city]: { at: now, payload: out } },
      };
      await writeStateAtomic(fp, newState);
      return { ok: true, payload: out, hit: "live" };
    } catch (e) {
      const aborted = e && (e.name === "AbortError" || e.code === "ABORT_ERR");
      if (ent && ent.payload) {
        return { ok: true, payload: ent.payload, hit: "stale" };
      }
      return {
        ok: false,
        status: 502,
        error: aborted ? "天气接口超时，请稍后再试" : "天气服务暂不可用",
      };
    } finally {
      clearTimeout(t);
    }
  });
}

/** 同城并发合并为一次上游请求 */
const inFlight = new Map();

/**
 * @param {{
 *   uploadDir: string;
 *   apiKey: string;
 *   city: string;
 *   ttlMs: number;
 *   dailyLimit: number;
 * }} opts
 */
function resolveClimateDeduped(opts) {
  const key = `${opts.uploadDir}\0${opts.city}`;
  let p = inFlight.get(key);
  if (!p) {
    p = resolveClimate(opts).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, p);
  }
  return p;
}

module.exports = {
  resolveClimate: resolveClimateDeduped,
  stateFilePath,
  calendarDateChina,
};
