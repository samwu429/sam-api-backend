const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

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
        
        // 【核心修正】严格使用 2.5 版本
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const fullPrompt = `
        You have the following knowledge about Sam Wu:
        ${SAM_RESUME_KNOWLEDGE_BASE}
        
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

const fs = require('fs');
const path = require('path');
const dataFile = path.join(__dirname, 'data.json');
if (!fs.existsSync(dataFile)) { fs.writeFileSync(dataFile, JSON.stringify({ photos: [], testimonials: [] })); }
function readData() { return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
function writeData(data) { fs.writeFileSync(dataFile, JSON.stringify(data, null, 2)); }

const checkVisitorPwd = (req, res, next) => {
    const pwd = req.headers['x-password'];
    if (pwd === '6429' || pwd === '0429') next();
    else res.status(401).json({ error: 'Unauthorized' });
};
const checkAdminPwd = (req, res, next) => {
    const pwd = req.headers['x-password'];
    if (pwd === '0429') next();
    else res.status(401).json({ error: 'Unauthorized Admin' });
};

app.get('/api/hidden/photos', checkVisitorPwd, (req, res) => { res.json(readData().photos); });
app.get('/api/hidden/testimonials', checkVisitorPwd, (req, res) => { res.json(readData().testimonials); });

app.post('/api/hidden/testimonials', checkVisitorPwd, (req, res) => {
    const { name, linkedin, relationship, comment } = req.body;
    if (!name || !relationship || !comment) return res.status(400).json({error: 'Missing fields'});
    const data = readData();
    data.testimonials.unshift({ id: Date.now().toString(), name, linkedin, relationship, comment, timestamp: new Date().toISOString() });
    writeData(data);
    res.json({ success: true });
});

app.post('/api/admin/photos', checkAdminPwd, (req, res) => {
    const { url, category } = req.body;
    if (!url || !category) return res.status(400).json({error: 'Missing fields'});
    const data = readData();
    data.photos.unshift({ id: Date.now().toString(), url, category, timestamp: new Date().toISOString() });
    writeData(data);
    res.json({ success: true });
});

app.delete('/api/admin/photos/:id', checkAdminPwd, (req, res) => {
    const data = readData();
    data.photos = data.photos.filter(p => p.id !== req.params.id);
    writeData(data);
    res.json({ success: true });
});

app.delete('/api/admin/testimonials/:id', checkAdminPwd, (req, res) => {
    const data = readData();
    data.testimonials = data.testimonials.filter(t => t.id !== req.params.id);
    writeData(data);
    res.json({ success: true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend live on Gemini 2.5 Flash!`));
