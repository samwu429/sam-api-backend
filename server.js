const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// Render runs behind one reverse proxy; this lets rate limiting see real client IPs.
// Render 部署位于单层反向代理之后；此设置使限流能识别真实客户端 IP。
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Allowlist of browser origins permitted to call the API under CORS.
// 允许通过 CORS 调用此 API 的浏览器来源白名单。
const allowedOrigins = [
    'https://samwu429.github.io',
    'https://topphi.com',
    'https://www.topphi.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];
// credentials:true makes the browser send/receive the cross-site session cookie
// and emits Access-Control-Allow-Credentials. Because the origin option is a
// function, the allowed origin is reflected back specifically (never "*"), which
// is mandatory once credentials are allowed.
// credentials:true 使浏览器在跨站请求中携带并接收会话 Cookie，并返回
// Access-Control-Allow-Credentials。由于 origin 为函数，允许的来源会被精确
// 回显（绝不会是 "*"），这是开启凭证后所必需的。
app.use(cors({
    origin: function (origin, callback) {
        // Disallowed origins simply get no CORS headers instead of a 500 error.
        callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true
}));

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});

// Skip compression for binary media streams so Range responses stay intact.
// 媒体二进制流跳过 gzip，避免破坏 Range 分段响应。
app.use(compression({
    filter: (req, res) => {
        if (/^\/api\/public\/stash\/media\//i.test(req.path)) return false;
        return compression.filter(req, res);
    }
}));
app.use(express.json({ limit: '25mb' }));

// Throttle repeated failed password attempts to blunt admin/visitor brute force.
// Successful requests are skipped so normal authenticated traffic is unaffected.
// 限制重复的失败密码尝试，以削弱对管理员/访客的暴力破解。成功请求不计入，
// 因而正常的已鉴权流量不受影响。
const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again later.' }
});
app.use('/api/admin', authLimiter);
app.use('/api/hidden', authLimiter);

const chatLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { reply: 'Too many requests. Please slow down and try again in a few minutes.' }
});

// Keepalive endpoint
app.get('/ping', (req, res) => res.send('pong'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

// ======================== Knowledge Base ========================
const SAM_RESUME_KNOWLEDGE_BASE = `
ROLE: You are the exclusive Professional AI Representative for Yihang (Sam) Wu. 
TONE: Confident, professional, persuasive, and meticulous.

SAM'S CORE INFORMATION:
1. EDUCATION:
   - University of Toronto (UofT), Canada (Sep 2025 - Jun 2029).
   - Department: Mathematics, Statistics and Computer Science.
   - Focusing on: Advanced statistical modeling, data analysis, and quantitative research.
   - High School: Kelowna Christian School (2020-2025).

2. TECHNICAL SKILLS (Sam's Superpowers):
   - Languages: Proficient in Python (Data Engineering/Automation), JavaScript (Web Dev), and R Studio (Stats).
   - Certification: Microsoft Technology Associate (MTA) in JavaScript.
   - Tools: Advanced Excel (VBA/Data Analysis), ERP Systems, FastAPI, Git.
   - Key Strength: Bridging the gap between complex mathematics and efficient code.

3. WORK EXPERIENCE:
   - Logistics & Data Intern @ Haicheng Hongshengda (Jul 2024 - Sep 2024).
   - Achievements: 
     * Developed Python scripts to automate monthly logistics-cost data processing.
     * Replaced manual workflows with automated visual report generation.
     * Managed inventory and shipment data through ERP systems with 100% accuracy.
     * Coordinated vehicle resources and verified waybills for on-time shipments.

4. BEYOND CODE (Character & Leadership):
   - Ward Missionary: Served at The Church of Jesus Christ of Latter-day Saints. Dedicated to community outreach and leadership.
   - Figure Skating Champion: Shenyang Men's Figure Skating Champion; Asian Figure Skating Free Style Level 2. Demonstrates extreme self-discipline and perseverance.
   - Volunteer Work: Spearheaded disability support campaigns and cooked/served meals for the homeless.

STRICT RESPONSE RULES:
- If asked about Python/JS/R, highlight Sam's internship success and UofT academic rigor.
- If asked "Can Sam do X?", and X involves Data, Stats, or Code, answer "Yes" and provide evidence from his profile.
- Always remain professional and aim to convince the user that Sam is a top-tier candidate.
- Reject any questions that are not related to Sam's professional or academic background.
`;

app.post('/chat', chatLimiter, async (req, res) => {
    try {
        const userMsg = typeof req.body.message === 'string' ? req.body.message.slice(0, 4000) : '';
        if (!userMsg.trim()) {
            return res.status(400).json({ reply: 'Please enter a message.' });
        }
        const history = (Array.isArray(req.body.history) ? req.body.history : [])
            .slice(-20)
            .map(h => ({
                role: h && h.role === 'AI' ? 'AI' : 'User',
                text: h && typeof h.text === 'string' ? h.text.slice(0, 4000) : ''
            }));

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        let conversation = history.map(h => `${h.role === 'AI' ? 'Sam Agent' : 'User'}: ${h.text}`).join('\n');
        
        const fullPrompt = `
        You have the following knowledge about Sam Wu:
        ${SAM_RESUME_KNOWLEDGE_BASE}
        
        Previous Conversation (Context):
        ${conversation}
        
        User's Request: "${userMsg}"
        
        Please provide a professional response as Sam's AI agent.
        `;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();

        res.json({ reply: text });
    } catch (error) {
        console.error("DEBUG:", error.message);
        res.json({ reply: 'Service temporarily unavailable. Please try again later.' });
    }
});

const mongoose = require('mongoose');
const multer = require('multer');
const { GridFSBucket, ObjectId } = require('mongodb');

const STASH_MEDIA_MAX_BYTES = 110 * 1024 * 1024;
const stashMediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: STASH_MEDIA_MAX_BYTES }
});

function getStashMediaBucket() {
    if (!mongoose.connection.db) throw new Error('Database not connected');
    return new GridFSBucket(mongoose.connection.db, { bucketName: 'stashMedia' });
}

async function deleteStashMediaGridFile(gridId) {
    if (!gridId) return;
    try {
        const bucket = getStashMediaBucket();
        await bucket.delete(new ObjectId(String(gridId)));
    } catch (_) {}
}

// ======================== MongoDB Configuration ========================
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('Connected to MongoDB Atlas!'))
        .catch(err => console.error('MongoDB connection error:', err));
} else {
    console.warn('MONGODB_URI environment variable is missing!');
}

// ======================== MongoDB Models ========================
const testimonialSchema = new mongoose.Schema({
    id: String,
    name: String,
    linkedin: String,
    relationship: String,
    comment: String,
    sortOrder: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },
    createdAt: String,
    timestamp: String
});
const Testimonial = mongoose.model('Testimonial', testimonialSchema);

const photoSchema = new mongoose.Schema({
    id: String,
    url: String,
    category: String,
    timestamp: String
});
const Photo = mongoose.model('Photo', photoSchema);

const publicationSchema = new mongoose.Schema({
    id: String,
    title: String,
    authors: String,
    venue: String,
    year: Number,
    link: String,
    abstract: String,
    sortOrder: { type: Number, default: 0 }
});
const Publication = mongoose.model('Publication', publicationSchema);

const blogPostSchema = new mongoose.Schema({
    id: String,
    text: String,
    images: [String],
    displayYear: Number,
    displayMonth: Number,
    displayDay: Number,
    timestamp: String
});
const BlogPost = mongoose.model('BlogPost', blogPostSchema);

const STASH_KINDS = ['photo', 'video', 'audio', 'article', 'note'];

const stashItemSchema = new mongoose.Schema({
    id: String,
    kind: { type: String, enum: STASH_KINDS },
    folderId: String,
    title: String,
    body: String,
    link: String,
    images: [String],
    mediaData: String,
    mediaGridId: String,
    mediaName: String,
    mediaMime: String,
    displayYear: Number,
    displayMonth: Number,
    displayDay: Number,
    timestamp: String
});
const StashItem = mongoose.model('StashItem', stashItemSchema);

const stashFolderSchema = new mongoose.Schema({
    id: String,
    name: String,
    body: String,
    parentId: String,
    coverImage: String,
    sortOrder: Number,
    timestamp: String
});
const StashFolder = mongoose.model('StashFolder', stashFolderSchema);

function blogSortDate(p) {
    const y = Number(p.displayYear) || 1970;
    const m = Math.min(12, Math.max(1, Number(p.displayMonth) || 1));
    const d = Math.min(31, Math.max(1, Number(p.displayDay) || 1));
    return new Date(y, m - 1, d).getTime();
}

// Constant-time comparison to avoid leaking password contents through timing.
// 使用常量时间比较，避免通过时序泄露密码内容。
function passwordMatches(provided, expected) {
    if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
    const a = crypto.createHash('sha256').update(provided).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
}

// Configured credentials with weak development fallbacks. Production deployments
// must set ADMIN_PASSWORD and VISITOR_PASSWORD; the fallbacks only keep the app
// usable before those environment variables are configured.
// 配置的凭证，附带较弱的开发回退值。生产部署须设置 ADMIN_PASSWORD 与
// VISITOR_PASSWORD；回退值仅用于在尚未配置前保持应用可用。
function adminPassword() {
    return process.env.ADMIN_PASSWORD || '0429';
}
function visitorPassword() {
    return process.env.VISITOR_PASSWORD || '6429';
}

// Secret used to sign session tokens. A configured SESSION_SECRET is strongly
// preferred; when absent, a per-process random secret keeps the app working,
// with the tradeoff that a restart invalidates outstanding tokens and forces
// users to log in again.
// 用于签发会话令牌的密钥。强烈建议配置 SESSION_SECRET；缺省时使用进程级
// 随机密钥以保持应用可用，代价是服务重启会使未过期令牌失效并要求重新登录。
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(48).toString('hex');

// Session lifetime in seconds, shared by admin and visitor tokens.
// 管理员与访客令牌共用的会话有效期（秒）。
const SESSION_TTL_SECONDS = 12 * 60 * 60;

// Distinct httpOnly cookie names per role.
// 按角色区分的 httpOnly Cookie 名称。
const ADMIN_COOKIE_NAME = 'admin_session';
const VISITOR_COOKIE_NAME = 'visitor_session';

// Shared session cookie attributes. SameSite=None with Secure is mandatory:
// the site (samwu429.github.io) and the API (*.onrender.com) are different
// origins, so the session cookie is third-party/cross-site and browsers drop it
// unless both flags are set. httpOnly keeps it out of reach of page JavaScript.
// 共享的会话 Cookie 属性。必须设置 SameSite=None 且 Secure：站点
//（samwu429.github.io）与 API（*.onrender.com）属于不同源，会话 Cookie 为
// 第三方/跨站，缺少这两项浏览器会丢弃；httpOnly 使其不被页面脚本读取。
const SESSION_COOKIE_BASE = { httpOnly: true, secure: true, sameSite: 'none', path: '/' };

function base64UrlEncode(input) {
    return Buffer.from(input).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64UrlToBuffer(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(normalized + padding, 'base64');
}

// Issue a compact "<payload>.<signature>" session token for the given role. The
// payload is readable base64url JSON; integrity is enforced by the HMAC
// signature and the embedded expiry bounds the token's validity.
// 为指定角色签发紧凑的 "<负载>.<签名>" 会话令牌。负载为可读的 base64url
// JSON，完整性由 HMAC 签名保证，内嵌的过期时间限定其有效期。
function issueSessionToken(role) {
    const payload = {
        role,
        exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
    };
    const body = base64UrlEncode(JSON.stringify(payload));
    const signature = base64UrlEncode(crypto.createHmac('sha256', SESSION_SECRET).update(body).digest());
    return `${body}.${signature}`;
}

// Validate a session token's signature and expiry, returning its role when valid
// or null otherwise. Signature comparison is constant-time.
// 校验会话令牌的签名与过期时间，有效时返回其角色，否则返回 null。签名比较为常量时间。
function sessionTokenRole(token) {
    if (typeof token !== 'string') return null;
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    if (!body || !signature) return null;
    const expected = base64UrlEncode(crypto.createHmac('sha256', SESSION_SECRET).update(body).digest());
    const providedBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
        return null;
    }
    let payload;
    try {
        payload = JSON.parse(base64UrlToBuffer(body).toString('utf8'));
    } catch (_) {
        return null;
    }
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
    }
    return payload.role === 'admin' || payload.role === 'visitor' ? payload.role : null;
}

// Extract a bearer token from the Authorization header, if present.
// 若存在，则从 Authorization 头中提取 Bearer 令牌。
function bearerToken(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
}

// Read a single cookie value from the raw Cookie header. Parsing it by hand
// avoids adding cookie-parser; this repo tracks node_modules with no .gitignore,
// so new dependencies are intentionally avoided.
// 从原始 Cookie 头中读取单个 Cookie 值。手工解析以避免引入 cookie-parser；
// 本仓库跟踪 node_modules 且无 .gitignore，故有意不新增依赖。
function readCookie(req, name) {
    const header = req.headers['cookie'];
    if (typeof header !== 'string' || !header) return '';
    for (const part of header.split(';')) {
        const trimmed = part.trim();
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        if (trimmed.slice(0, eq) === name) {
            return decodeURIComponent(trimmed.slice(eq + 1));
        }
    }
    return '';
}

// Authorization gate for the private gallery. Reads the session token in
// priority order: httpOnly cookie first (primary), then Authorization: Bearer
// (fallback when third-party cookies are blocked), then the legacy x-password
// header. Accepts a valid admin or visitor role.
// 私密图库的鉴权关卡。按优先级读取会话令牌：先 httpOnly Cookie（主用），
// 再 Authorization: Bearer（第三方 Cookie 被拦截时的兜底），最后旧版
// x-password 头。接受有效的管理员或访客角色。
const checkVisitorPwd = (req, res, next) => {
    let role = sessionTokenRole(readCookie(req, ADMIN_COOKIE_NAME))
        || sessionTokenRole(readCookie(req, VISITOR_COOKIE_NAME));
    if (role !== 'admin' && role !== 'visitor') role = sessionTokenRole(bearerToken(req));
    if (role === 'admin' || role === 'visitor') return next();
    const pwd = req.headers['x-password'];
    if (passwordMatches(pwd, visitorPassword()) || passwordMatches(pwd, adminPassword())) return next();
    res.status(401).json({ error: 'Unauthorized' });
};

// Authorization gate for admin-only routes. Reads the session token in priority
// order: httpOnly cookie first (primary), then Authorization: Bearer (fallback
// when third-party cookies are blocked), then the legacy x-password header.
// Requires the admin role.
// 仅管理员路由的鉴权关卡。按优先级读取会话令牌：先 httpOnly Cookie（主用），
// 再 Authorization: Bearer（第三方 Cookie 被拦截时的兜底），最后旧版
// x-password 头。要求管理员角色。
const checkAdminPwd = (req, res, next) => {
    let role = sessionTokenRole(readCookie(req, ADMIN_COOKIE_NAME));
    if (role !== 'admin') role = sessionTokenRole(bearerToken(req));
    if (role === 'admin') return next();
    const pwd = req.headers['x-password'];
    if (passwordMatches(pwd, adminPassword())) return next();
    res.status(401).json({ error: 'Unauthorized Admin' });
};

// Exchange a valid admin password for a short-lived admin session token. The
// auth rate limiter mounted on /api/admin also guards this route.
// 用有效的管理员密码换取短期管理员会话令牌。挂载在 /api/admin 上的限流器同样保护此路由。
app.post('/api/admin/login', (req, res) => {
    const pwd = req.body ? req.body.password : '';
    if (!passwordMatches(pwd, adminPassword())) {
        return res.status(401).json({ error: 'Unauthorized Admin' });
    }
    const token = issueSessionToken('admin');
    // Primary mechanism: an httpOnly cookie the page JavaScript cannot read. The
    // token is also returned in the body as a Bearer fallback for clients whose
    // browser blocks third-party cookies.
    // 主用机制：页面脚本无法读取的 httpOnly Cookie。同时在响应体返回令牌作为
    // Bearer 兜底，供浏览器拦截第三方 Cookie 的客户端使用。
    res.cookie(ADMIN_COOKIE_NAME, token, { ...SESSION_COOKIE_BASE, maxAge: SESSION_TTL_SECONDS * 1000 });
    res.json({ token, role: 'admin', expiresIn: SESSION_TTL_SECONDS });
});

// Clear the admin session cookie. A server route is required because httpOnly
// cookies cannot be removed by page JavaScript.
// 清除管理员会话 Cookie。因 httpOnly Cookie 无法被页面脚本删除，故需服务端路由。
app.post('/api/admin/logout', (req, res) => {
    res.clearCookie(ADMIN_COOKIE_NAME, SESSION_COOKIE_BASE);
    res.json({ ok: true });
});

// Exchange a valid visitor (or admin) password for a visitor-scope session token
// used by the private gallery. Mounted under /api/hidden so the limiter applies.
// 用有效的访客（或管理员）密码换取访客作用域会话令牌，供私密图库使用。挂载在 /api/hidden 下，因而受限流器保护。
app.post('/api/hidden/login', (req, res) => {
    const pwd = req.body ? req.body.password : '';
    if (!passwordMatches(pwd, visitorPassword()) && !passwordMatches(pwd, adminPassword())) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = issueSessionToken('visitor');
    // Primary mechanism: an httpOnly cookie. The token is also returned in the
    // body as a Bearer fallback when third-party cookies are blocked.
    // 主用机制：httpOnly Cookie。同时在响应体返回令牌作为 Bearer 兜底，
    // 供第三方 Cookie 被拦截时使用。
    res.cookie(VISITOR_COOKIE_NAME, token, { ...SESSION_COOKIE_BASE, maxAge: SESSION_TTL_SECONDS * 1000 });
    res.json({ token, role: 'visitor', expiresIn: SESSION_TTL_SECONDS });
});

// Clear the visitor session cookie (httpOnly cookies require a server route).
// 清除访客会话 Cookie（httpOnly Cookie 需服务端路由清除）。
app.post('/api/hidden/logout', (req, res) => {
    res.clearCookie(VISITOR_COOKIE_NAME, SESSION_COOKIE_BASE);
    res.json({ ok: true });
});

app.get('/api/admin/ping', checkAdminPwd, (req, res) => {
    res.json({ ok: true });
});

app.get('/api/public/publications', async (req, res) => {
    try {
        const rows = await Publication.find().sort({ sortOrder: -1, year: -1, _id: -1 }).lean();
        res.json(rows.map(p => ({
            id: p.id,
            title: p.title,
            authors: p.authors,
            venue: p.venue,
            year: p.year,
            link: p.link,
            abstract: p.abstract
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/public/blog', async (req, res) => {
    try {
        const rows = await BlogPost.find().lean();
        const sorted = rows.sort((a, b) => blogSortDate(b) - blogSortDate(a));
        res.json(sorted.map(p => ({
            id: p.id,
            text: p.text,
            images: p.images || [],
            displayYear: p.displayYear,
            displayMonth: p.displayMonth,
            displayDay: p.displayDay,
            timestamp: p.timestamp
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/publications', checkAdminPwd, async (req, res) => {
    try {
        const rows = await Publication.find().sort({ sortOrder: -1, year: -1, _id: -1 }).lean();
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/publications', checkAdminPwd, async (req, res) => {
    try {
        const { title, authors, venue, year, link, abstract, sortOrder } = req.body;
        if (!title || String(title).trim() === '') {
            return res.status(400).json({ error: 'Title required' });
        }
        await Publication.create({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            title: String(title).trim(),
            authors: authors != null ? String(authors) : '',
            venue: venue != null ? String(venue) : '',
            year: year != null && year !== '' ? Number(year) : null,
            link: link != null ? String(link).trim() : '',
            abstract: abstract != null ? String(abstract) : '',
            sortOrder: sortOrder != null && sortOrder !== '' ? Number(sortOrder) : 0
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admin/publications/:id', checkAdminPwd, async (req, res) => {
    try {
        const { title, authors, venue, year, link, abstract, sortOrder } = req.body;
        const id = req.params.id;
        const update = {};
        if (title != null) update.title = String(title).trim();
        if (authors != null) update.authors = String(authors);
        if (venue != null) update.venue = String(venue);
        if (year !== undefined) update.year = year === '' || year == null ? null : Number(year);
        if (link != null) update.link = String(link).trim();
        if (abstract != null) update.abstract = String(abstract);
        if (sortOrder !== undefined) update.sortOrder = sortOrder === '' || sortOrder == null ? 0 : Number(sortOrder);
        await Publication.updateOne({ id }, { $set: update });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/publications/:id', checkAdminPwd, async (req, res) => {
    try {
        await Publication.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/blog', checkAdminPwd, async (req, res) => {
    try {
        const rows = await BlogPost.find().lean();
        const sorted = rows.sort((a, b) => blogSortDate(b) - blogSortDate(a));
        res.json(sorted);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/blog', checkAdminPwd, async (req, res) => {
    try {
        const { text, images, displayYear, displayMonth, displayDay } = req.body;
        const imgs = Array.isArray(images) ? images.filter(Boolean) : [];
        if (!imgs.length) {
            return res.status(400).json({ error: 'At least one image required' });
        }
        const y = Number(displayYear);
        const m = Number(displayMonth);
        const d = Number(displayDay);
        if (!y || !m || !d) {
            return res.status(400).json({ error: 'Display date (Y/M/D) required' });
        }
        await BlogPost.create({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            text: text != null ? String(text) : '',
            images: imgs,
            displayYear: y,
            displayMonth: m,
            displayDay: d,
            timestamp: new Date().toISOString()
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admin/blog/:id', checkAdminPwd, async (req, res) => {
    try {
        const { text, images, displayYear, displayMonth, displayDay } = req.body;
        const id = req.params.id;
        const update = {};
        if (text != null) update.text = String(text);
        if (images != null) {
            if (!Array.isArray(images) || !images.length) {
                return res.status(400).json({ error: 'At least one image required' });
            }
            update.images = images;
        }
        if (displayYear != null) update.displayYear = Number(displayYear);
        if (displayMonth != null) update.displayMonth = Number(displayMonth);
        if (displayDay != null) update.displayDay = Number(displayDay);
        await BlogPost.updateOne({ id }, { $set: update });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/blog/:id', checkAdminPwd, async (req, res) => {
    try {
        await BlogPost.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

function mapStashRow(row) {
    return {
        id: row.id,
        kind: row.kind,
        folderId: row.folderId || '',
        title: row.title || '',
        body: row.body || '',
        link: row.link || '',
        images: row.images || [],
        mediaData: row.mediaData || '',
        mediaGridId: row.mediaGridId || '',
        mediaName: row.mediaName || '',
        mediaMime: row.mediaMime || '',
        displayYear: row.displayYear,
        displayMonth: row.displayMonth,
        displayDay: row.displayDay,
        timestamp: row.timestamp
    };
}

function mapStashFolderRow(row) {
    return {
        id: row.id,
        name: row.name || '',
        body: row.body || '',
        parentId: row.parentId || '',
        coverImage: row.coverImage || '',
        sortOrder: row.sortOrder != null ? Number(row.sortOrder) : 0,
        timestamp: row.timestamp
    };
}

function sortStashFolders(rows) {
    return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
        const ao = Number(a && a.sortOrder != null ? a.sortOrder : 0);
        const bo = Number(b && b.sortOrder != null ? b.sortOrder : 0);
        if (ao !== bo) return ao - bo;
        const an = String(a && a.name ? a.name : '').toLowerCase();
        const bn = String(b && b.name ? b.name : '').toLowerCase();
        if (an !== bn) return an.localeCompare(bn);
        const at = new Date(a && a.timestamp ? a.timestamp : 0).getTime();
        const bt = new Date(b && b.timestamp ? b.timestamp : 0).getTime();
        return bt - at;
    });
}

function validateStashFolderBody(body, folderId) {
    const name = body.name != null ? String(body.name).trim() : '';
    if (!name) return 'Folder name is required';
    const parentId = body.parentId != null ? String(body.parentId).trim() : '';
    if (folderId && parentId === folderId) return 'A folder cannot be its own parent';
    return null;
}

async function stashFolderDescendantIds(rootId) {
    const all = await StashFolder.find().lean();
    const ids = new Set();
    const queue = [rootId];
    while (queue.length) {
        const current = queue.shift();
        if (!current || ids.has(current)) continue;
        ids.add(current);
        all.filter((f) => String(f.parentId || '') === String(current)).forEach((f) => {
            if (f.id) queue.push(f.id);
        });
    }
    return ids;
}

function validateStashBody(body) {
    const kind = body.kind != null ? String(body.kind) : '';
    if (!STASH_KINDS.includes(kind)) {
        return 'Kind must be photo, video, audio, article, or note';
    }
    const title = body.title != null ? String(body.title).trim() : '';
    const text = body.body != null ? String(body.body).trim() : '';
    const link = body.link != null ? String(body.link).trim() : '';
    const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];
    const mediaData = body.mediaData != null ? String(body.mediaData).trim() : '';
    const mediaGridId = body.mediaGridId != null ? String(body.mediaGridId).trim() : '';
    const hasMedia = !!(mediaData || mediaGridId);

    if (kind === 'photo' && !images.length) {
        return 'Photo items need at least one image';
    }
    if (kind === 'video' && !link && !hasMedia) {
        return 'Video needs a YouTube/Vimeo link or an uploaded video file';
    }
    if (kind === 'audio' && !hasMedia) {
        return 'Audio needs an uploaded MP3 (or other audio) file';
    }
    if (kind === 'article' && !title && !text && !link && !hasMedia) {
        return 'Article needs a title, body, link, or PDF';
    }
    if (kind === 'note' && !text && !hasMedia) {
        return 'Note needs body text or a PDF';
    }
    const y = Number(body.displayYear);
    const m = Number(body.displayMonth);
    const d = Number(body.displayDay);
    if (!y || !m || !d) return 'Display date (Y/M/D) required';
    return null;
}

app.post('/api/admin/stash/media', checkAdminPwd, (req, res) => {
    stashMediaUpload.single('file')(req, res, async (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE'
                ? 'File is too large (max 110 MB)'
                : (err.message || 'Upload failed');
            return res.status(400).json({ error: msg });
        }
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        try {
            const bucket = getStashMediaBucket();
            const uploadStream = bucket.openUploadStream(req.file.originalname || 'upload', {
                contentType: req.file.mimetype || 'application/octet-stream',
                metadata: { mime: req.file.mimetype || '' }
            });
            uploadStream.end(req.file.buffer);
            uploadStream.on('error', (e) => res.status(500).json({ error: e.message }));
            uploadStream.on('finish', () => {
                res.json({
                    gridId: uploadStream.id.toString(),
                    name: req.file.originalname || 'upload',
                    mime: req.file.mimetype || ''
                });
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
});

// Public media stream for stash uploads. Supports HTTP Range so browsers can
// seek and play audio/video reliably (especially Safari and Chrome media elements).
// Pass ?download=1 to force Content-Disposition: attachment so the browser saves
// the file locally instead of opening it as a new page.
// 零碎架上传媒体的公开流接口。支持 HTTP Range，便于浏览器可靠拖动进度与播放
//（尤其是 Safari 与 Chrome 的媒体元素）。加 ?download=1 时改为 attachment，
// 让浏览器直接保存到本地而不是新开页面打开。
app.get('/api/public/stash/media/:id', async (req, res) => {
    try {
        const bucket = getStashMediaBucket();
        const fileId = new ObjectId(String(req.params.id));
        const files = await bucket.find({ _id: fileId }).toArray();
        if (!files.length) return res.status(404).json({ error: 'Not found' });
        const file = files[0];
        const mime = (file.metadata && file.metadata.mime) || file.contentType || 'application/octet-stream';
        const size = Number(file.length) || 0;
        let filename = String(file.filename || 'file').replace(/["\r\n]/g, '');
        const forceDownload = String(req.query.download || '') === '1' || String(req.query.download || '').toLowerCase() === 'true';
        if (forceDownload) {
            const lower = filename.toLowerCase();
            if (/^audio\//i.test(mime) && !/\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(lower)) {
                filename = `${filename || 'audio'}.mp3`;
            } else if (/pdf/i.test(mime) && !/\.pdf$/i.test(lower)) {
                filename = `${filename || 'document'}.pdf`;
            }
        }

        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Accept-Ranges', 'bytes');
        const disposition = forceDownload ? 'attachment' : 'inline';
        res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);

        const rangeHeader = req.headers.range;
        if (rangeHeader && size > 0 && !forceDownload) {
            const match = String(rangeHeader).match(/bytes=(\d*)-(\d*)/);
            if (!match) {
                res.status(416);
                res.setHeader('Content-Range', `bytes */${size}`);
                return res.end();
            }
            let start = match[1] !== '' ? parseInt(match[1], 10) : 0;
            let end = match[2] !== '' ? parseInt(match[2], 10) : (size - 1);
            if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || start > end) {
                res.status(416);
                res.setHeader('Content-Range', `bytes */${size}`);
                return res.end();
            }
            end = Math.min(end, size - 1);
            const chunkSize = end - start + 1;
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
            res.setHeader('Content-Length', String(chunkSize));
            // openDownloadStream end is exclusive.
            // openDownloadStream 的 end 为开区间上界。
            return bucket.openDownloadStream(fileId, { start, end: end + 1 }).pipe(res);
        }

        if (size > 0) res.setHeader('Content-Length', String(size));
        bucket.openDownloadStream(fileId).pipe(res);
    } catch (e) {
        res.status(404).json({ error: 'Not found' });
    }
});

app.get('/api/public/stash/folders', async (req, res) => {
    try {
        const rows = await StashFolder.find().lean();
        res.json(sortStashFolders(rows).map(mapStashFolderRow));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/public/stash/folders/:id', async (req, res) => {
    try {
        const row = await StashFolder.findOne({ id: req.params.id }).lean();
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(mapStashFolderRow(row));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/public/stash', async (req, res) => {
    try {
        const rows = await StashItem.find().lean();
        const sorted = rows.sort((a, b) => blogSortDate(b) - blogSortDate(a));
        res.json(sorted.map(mapStashRow));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/public/stash/:id', async (req, res) => {
    try {
        const row = await StashItem.findOne({ id: req.params.id }).lean();
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(mapStashRow(row));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/stash/folders', checkAdminPwd, async (req, res) => {
    try {
        const rows = await StashFolder.find().lean();
        res.json(sortStashFolders(rows).map(mapStashFolderRow));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/stash/folders', checkAdminPwd, async (req, res) => {
    try {
        const err = validateStashFolderBody(req.body);
        if (err) return res.status(400).json({ error: err });
        const parentId = req.body.parentId != null ? String(req.body.parentId).trim() : '';
        if (parentId) {
            const parent = await StashFolder.findOne({ id: parentId }).lean();
            if (!parent) return res.status(400).json({ error: 'Parent folder not found' });
        }
        await StashFolder.create({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            name: String(req.body.name).trim(),
            body: req.body.body != null ? String(req.body.body) : '',
            parentId,
            coverImage: req.body.coverImage != null ? String(req.body.coverImage) : '',
            sortOrder: req.body.sortOrder != null && req.body.sortOrder !== '' ? Number(req.body.sortOrder) : 0,
            timestamp: new Date().toISOString()
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admin/stash/folders/:id', checkAdminPwd, async (req, res) => {
    try {
        const folderId = req.params.id;
        const existing = await StashFolder.findOne({ id: folderId }).lean();
        if (!existing) return res.status(404).json({ error: 'Not found' });
        const merged = {
            name: req.body.name != null ? req.body.name : existing.name,
            parentId: req.body.parentId != null ? req.body.parentId : (existing.parentId || ''),
            body: req.body.body != null ? req.body.body : existing.body,
            coverImage: req.body.coverImage !== undefined ? req.body.coverImage : (existing.coverImage || ''),
            sortOrder: req.body.sortOrder != null ? req.body.sortOrder : existing.sortOrder
        };
        const err = validateStashFolderBody(merged, folderId);
        if (err) return res.status(400).json({ error: err });
        const parentId = merged.parentId != null ? String(merged.parentId).trim() : '';
        if (parentId) {
            if (parentId === folderId) return res.status(400).json({ error: 'A folder cannot be its own parent' });
            const parent = await StashFolder.findOne({ id: parentId }).lean();
            if (!parent) return res.status(400).json({ error: 'Parent folder not found' });
            const descendants = await stashFolderDescendantIds(folderId);
            if (descendants.has(parentId)) {
                return res.status(400).json({ error: 'Cannot move a folder inside its own descendant' });
            }
        }
        const update = {};
        if (req.body.name != null) update.name = String(req.body.name).trim();
        if (req.body.body != null) update.body = String(req.body.body);
        if (req.body.parentId != null) update.parentId = parentId;
        if (req.body.coverImage !== undefined) update.coverImage = String(req.body.coverImage || '');
        if (req.body.sortOrder != null) update.sortOrder = Number(req.body.sortOrder) || 0;
        await StashFolder.updateOne({ id: folderId }, { $set: update });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/stash/folders/:id', checkAdminPwd, async (req, res) => {
    try {
        const folderId = req.params.id;
        const existing = await StashFolder.findOne({ id: folderId }).lean();
        if (!existing) return res.status(404).json({ error: 'Not found' });
        const parentId = String(existing.parentId || '');
        await StashFolder.updateMany({ parentId: folderId }, { $set: { parentId } });
        await StashItem.updateMany({ folderId }, { $set: { folderId: parentId } });
        await StashFolder.deleteOne({ id: folderId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/stash', checkAdminPwd, async (req, res) => {
    try {
        const rows = await StashItem.find().lean();
        const sorted = rows.sort((a, b) => blogSortDate(b) - blogSortDate(a));
        res.json(sorted);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/stash', checkAdminPwd, async (req, res) => {
    try {
        const err = validateStashBody(req.body);
        if (err) return res.status(400).json({ error: err });
        const { kind, title, body, link, images, mediaData, mediaGridId, mediaName, mediaMime, displayYear, displayMonth, displayDay, folderId } = req.body;
        await StashItem.create({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            kind: String(kind),
            folderId: folderId != null ? String(folderId).trim() : '',
            title: title != null ? String(title) : '',
            body: body != null ? String(body) : '',
            link: link != null ? String(link).trim() : '',
            images: Array.isArray(images) ? images.filter(Boolean) : [],
            mediaData: mediaData != null ? String(mediaData) : '',
            mediaGridId: mediaGridId != null ? String(mediaGridId) : '',
            mediaName: mediaName != null ? String(mediaName) : '',
            mediaMime: mediaMime != null ? String(mediaMime) : '',
            displayYear: Number(displayYear),
            displayMonth: Number(displayMonth),
            displayDay: Number(displayDay),
            timestamp: new Date().toISOString()
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admin/stash/:id', checkAdminPwd, async (req, res) => {
    try {
        const existing = await StashItem.findOne({ id: req.params.id }).lean();
        if (!existing) return res.status(404).json({ error: 'Not found' });
        const merged = {
            kind: req.body.kind != null ? req.body.kind : existing.kind,
            title: req.body.title != null ? req.body.title : existing.title,
            body: req.body.body != null ? req.body.body : existing.body,
            link: req.body.link != null ? req.body.link : existing.link,
            images: req.body.images != null ? req.body.images : (existing.images || []),
            mediaData: req.body.mediaData !== undefined ? req.body.mediaData : (existing.mediaData || ''),
            mediaGridId: req.body.mediaGridId !== undefined ? req.body.mediaGridId : (existing.mediaGridId || ''),
            mediaName: req.body.mediaName !== undefined ? req.body.mediaName : (existing.mediaName || ''),
            mediaMime: req.body.mediaMime !== undefined ? req.body.mediaMime : (existing.mediaMime || ''),
            displayYear: req.body.displayYear != null ? req.body.displayYear : existing.displayYear,
            displayMonth: req.body.displayMonth != null ? req.body.displayMonth : existing.displayMonth,
            displayDay: req.body.displayDay != null ? req.body.displayDay : existing.displayDay,
            folderId: req.body.folderId != null ? req.body.folderId : (existing.folderId || '')
        };
        const err = validateStashBody(merged);
        if (err) return res.status(400).json({ error: err });
        const update = {};
        if (req.body.kind != null) update.kind = String(req.body.kind);
        if (req.body.title != null) update.title = String(req.body.title);
        if (req.body.body != null) update.body = String(req.body.body);
        if (req.body.link != null) update.link = String(req.body.link).trim();
        if (req.body.images != null) update.images = Array.isArray(req.body.images) ? req.body.images.filter(Boolean) : [];
        if (req.body.mediaData !== undefined) update.mediaData = String(req.body.mediaData || '');
        if (req.body.mediaGridId !== undefined) update.mediaGridId = String(req.body.mediaGridId || '');
        if (req.body.mediaName !== undefined) update.mediaName = String(req.body.mediaName || '');
        if (req.body.mediaMime !== undefined) update.mediaMime = String(req.body.mediaMime || '');
        if (req.body.displayYear != null) update.displayYear = Number(req.body.displayYear);
        if (req.body.displayMonth != null) update.displayMonth = Number(req.body.displayMonth);
        if (req.body.displayDay != null) update.displayDay = Number(req.body.displayDay);
        if (req.body.folderId != null) update.folderId = String(req.body.folderId).trim();
        const nextGridId = update.mediaGridId !== undefined ? update.mediaGridId : (existing.mediaGridId || '');
        const prevGridId = existing.mediaGridId || '';
        if (prevGridId && prevGridId !== nextGridId) {
            await deleteStashMediaGridFile(prevGridId);
        }
        if (req.body.mediaData !== undefined && !String(req.body.mediaData || '').trim() && prevGridId && !nextGridId) {
            await deleteStashMediaGridFile(prevGridId);
        }
        await StashItem.updateOne({ id: req.params.id }, { $set: update });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/stash/:id', checkAdminPwd, async (req, res) => {
    try {
        const existing = await StashItem.findOne({ id: req.params.id }).lean();
        if (existing && existing.mediaGridId) {
            await deleteStashMediaGridFile(existing.mediaGridId);
        }
        await StashItem.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/public/testimonials', async (req, res) => {
    try {
        const testimonials = await Testimonial.find({ isPublic: { $ne: false } }).sort({ sortOrder: 1, _id: -1 }).lean();
        const data = testimonials.map(t => ({
            id: t.id,
            name: t.name,
            relationship: t.relationship,
            comment: t.comment,
            sortOrder: t.sortOrder != null ? Number(t.sortOrder) : 0,
            isPublic: t.isPublic !== false,
            createdAt: t.createdAt || t.timestamp || null,
            timestamp: t.timestamp
        }));
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/hidden/photos', checkVisitorPwd, async (req, res) => { 
    try {
        const photos = await Photo.find().sort({ _id: -1 }).lean();
        res.json(photos); 
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/hidden/testimonials', checkVisitorPwd, async (req, res) => { 
    try {
        const testimonials = await Testimonial.find().sort({ sortOrder: 1, _id: -1 }).lean();
        res.json(testimonials); 
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/hidden/testimonials', checkVisitorPwd, async (req, res) => {
    try {
        const { id, name, linkedin, relationship, comment, sortOrder, isPublic, createdAt, timestamp } = req.body || {};
        if (!name || !relationship || !comment) return res.status(400).json({error: 'Missing fields'});
        const nowIso = new Date().toISOString();
        const created = createdAt || timestamp || nowIso;
        await Testimonial.create({ 
            id: id || Date.now().toString(),
            name: String(name),
            linkedin: linkedin != null ? String(linkedin) : '',
            relationship: String(relationship),
            comment: String(comment),
            sortOrder: sortOrder != null && sortOrder !== '' ? Number(sortOrder) : 0,
            isPublic: isPublic !== false,
            createdAt: String(created),
            timestamp: String(created)
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admin/testimonials/:id', checkAdminPwd, async (req, res) => {
    try {
        const id = req.params.id;
        const body = req.body || {};
        const update = {};
        if (body.name != null) update.name = String(body.name);
        if (body.linkedin != null) update.linkedin = String(body.linkedin);
        if (body.relationship != null) update.relationship = String(body.relationship);
        if (body.comment != null) update.comment = String(body.comment);
        if (body.sortOrder !== undefined) update.sortOrder = body.sortOrder === '' || body.sortOrder == null ? 0 : Number(body.sortOrder);
        if (body.isPublic !== undefined) update.isPublic = body.isPublic !== false;
        if (body.createdAt != null) update.createdAt = String(body.createdAt);
        if (body.timestamp != null) update.timestamp = String(body.timestamp);
        await Testimonial.updateOne({ id }, { $set: update });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/photos', checkAdminPwd, async (req, res) => {
    try {
        const { url, category } = req.body;
        if (!url || !category) return res.status(400).json({error: 'Missing fields'});
        
        await Photo.create({ 
            id: Date.now().toString(), 
            url, category, 
            timestamp: new Date().toISOString() 
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/photos/:id', checkAdminPwd, async (req, res) => {
    try {
        await Photo.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/testimonials/:id', checkAdminPwd, async (req, res) => {
    try {
        await Testimonial.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend live on Gemini 2.5 Flash!`));
