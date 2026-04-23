const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// CORS Configuration
const allowedOrigins = [
    'https://samwu429.github.io',
    'https://topphi.com',
    'https://www.topphi.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

app.use(express.json({ limit: '25mb' }));

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

app.post('/chat', async (req, res) => {
    try {
        const userMsg = req.body.message;
        const history = req.body.history || [];
        
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
        res.json({ reply: `Service temporarily unavailable. Please try again later. (${error.message})` });
    }
});

const mongoose = require('mongoose');

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

function blogSortDate(p) {
    const y = Number(p.displayYear) || 1970;
    const m = Math.min(12, Math.max(1, Number(p.displayMonth) || 1));
    const d = Math.min(31, Math.max(1, Number(p.displayDay) || 1));
    return new Date(y, m - 1, d).getTime();
}

const checkVisitorPwd = (req, res, next) => {
    const pwd = req.headers['x-password'];
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

app.get('/api/admin/ping', checkAdminPwd, (req, res) => {
    res.json({ ok: true });
});

app.get('/api/public/publications', async (req, res) => {
    try {
        const rows = await Publication.find().sort({ sortOrder: -1, year: -1, _id: -1 });
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
        const rows = await BlogPost.find();
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
        const rows = await Publication.find().sort({ sortOrder: -1, year: -1, _id: -1 });
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
        const rows = await BlogPost.find();
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

app.get('/api/public/testimonials', async (req, res) => {
    try {
        const testimonials = await Testimonial.find({ isPublic: { $ne: false } }).sort({ sortOrder: 1, _id: -1 });
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
        const photos = await Photo.find().sort({ _id: -1 });
        res.json(photos); 
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/hidden/testimonials', checkVisitorPwd, async (req, res) => { 
    try {
        const testimonials = await Testimonial.find().sort({ sortOrder: 1, _id: -1 });
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
