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
const multer = require('multer');
const { GridFSBucket, ObjectId } = require('mongodb');

const STASH_MEDIA_MAX_BYTES = 100 * 1024 * 1024;
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

const STASH_KINDS = ['photo', 'video', 'article', 'note'];

const stashItemSchema = new mongoose.Schema({
    id: String,
    kind: { type: String, enum: STASH_KINDS },
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

function mapStashRow(row) {
    return {
        id: row.id,
        kind: row.kind,
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

function validateStashBody(body) {
    const kind = body.kind != null ? String(body.kind) : '';
    if (!STASH_KINDS.includes(kind)) {
        return 'Kind must be photo, video, article, or note';
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
                ? 'File is too large (max 100 MB)'
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

app.get('/api/public/stash/media/:id', async (req, res) => {
    try {
        const bucket = getStashMediaBucket();
        const fileId = new ObjectId(String(req.params.id));
        const files = await bucket.find({ _id: fileId }).toArray();
        if (!files.length) return res.status(404).json({ error: 'Not found' });
        const file = files[0];
        const mime = (file.metadata && file.metadata.mime) || file.contentType || 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const filename = file.filename || 'file';
        res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
        bucket.openDownloadStream(fileId).pipe(res);
    } catch (e) {
        res.status(404).json({ error: 'Not found' });
    }
});

app.get('/api/public/stash', async (req, res) => {
    try {
        const rows = await StashItem.find();
        const sorted = rows.sort((a, b) => blogSortDate(b) - blogSortDate(a));
        res.json(sorted.map(mapStashRow));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/public/stash/:id', async (req, res) => {
    try {
        const row = await StashItem.findOne({ id: req.params.id });
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(mapStashRow(row));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/stash', checkAdminPwd, async (req, res) => {
    try {
        const rows = await StashItem.find();
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
        const { kind, title, body, link, images, mediaData, mediaGridId, mediaName, mediaMime, displayYear, displayMonth, displayDay } = req.body;
        await StashItem.create({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            kind: String(kind),
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
        const existing = await StashItem.findOne({ id: req.params.id });
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
            displayDay: req.body.displayDay != null ? req.body.displayDay : existing.displayDay
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
        const existing = await StashItem.findOne({ id: req.params.id });
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
