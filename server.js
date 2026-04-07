const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// 安全防盗刷：配置 CORS 白名单
const allowedOrigins = ['https://samwu429.github.io', 'http://localhost:3000', 'http://127.0.0.1:3000'];
app.use(cors({
    origin: function (origin, callback) {
        // 允许没有 origin 的请求（比如服务器内部请求，或者 curl）以及白名单内的请求
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(express.json({ limit: '10mb' }));

// 唤醒接口 (解决预热报404的问题)
app.get('/ping', (req, res) => res.send('pong'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

// ======================== 你的超级全能知识库 (彻底懂你版) ========================
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

app.post('/chat', async (req, res) => {
    try {
        const userMsg = req.body.message;
        const history = req.body.history || []; // 接收前端传来的历史记录
        
        // 【核心修正】严格使用 2.5 版本
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        // 拼接历史对话上下文
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
        res.json({ reply: `🔴 2.5版本请求失败: ${error.message}` });
    }
});

const mongoose = require('mongoose');

// ======================== MongoDB 连接设置 ========================
// 强烈建议不要把带有密码的链接写在代码里，而是通过 Render 的环境变量注入
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('✅ Connected to MongoDB Atlas!'))
        .catch(err => console.error('❌ MongoDB connection error:', err));
} else {
    console.warn('⚠️ MONGODB_URI environment variable is missing!');
}

// ======================== MongoDB 数据模型 ========================
const testimonialSchema = new mongoose.Schema({
    id: String,
    name: String,
    linkedin: String,
    relationship: String,
    comment: String,
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

const checkVisitorPwd = (req, res, next) => {
    const pwd = req.headers['x-password'];
    // 使用环境变量，如果没配暂时回退到硬编码（强烈建议在Render配好后删掉硬编码）
    const visitorEnv = process.env.VISITOR_PASSWORD || '6429';
    const adminEnv = process.env.ADMIN_PASSWORD || '0429';
    if (pwd === visitorEnv || pwd === adminEnv) next();
    else res.status(401).json({ error: 'Unauthorized' });
};
const checkAdminPwd = (req, res, next) => {
    const pwd = req.headers['x-password'];
    const adminEnv = process.env.ADMIN_PASSWORD || '0429';
    if (pwd === adminEnv) next();
    else res.status(401).json({ error: 'Unauthorized Admin' });
};

app.get('/api/public/testimonials', async (req, res) => {
    try {
        const testimonials = await Testimonial.find().sort({ _id: -1 });
        const data = testimonials.map(t => ({
            id: t.id,
            relationship: t.relationship,
            comment: t.comment,
            timestamp: t.timestamp
        }));
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/hidden/photos', checkVisitorPwd, async (req, res) => { 
    try {
        const photos = await Photo.find().sort({ _id: -1 });
        res.json(photos); 
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/hidden/testimonials', checkVisitorPwd, async (req, res) => { 
    try {
        const testimonials = await Testimonial.find().sort({ _id: -1 });
        res.json(testimonials); 
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/hidden/testimonials', checkVisitorPwd, async (req, res) => {
    try {
        const { name, linkedin, relationship, comment } = req.body;
        if (!name || !relationship || !comment) return res.status(400).json({error: 'Missing fields'});
        
        await Testimonial.create({ 
            id: Date.now().toString(), 
            name, linkedin, relationship, comment, 
            timestamp: new Date().toISOString() 
        });
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
