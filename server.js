const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors()); // 允许你的前端网页跨域访问
app.use(express.json());

// 这里引用我们在 Render 环境变量里存的 Key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

const SYSTEM_PROMPT = `You are Sam Wu's professional AI assistant. 
Data: UofT Math/Stats/CS student, Logistics Intern, Microsoft JS Certified.
Rules: Only answer professional questions about Sam. Be confident and concise.`;

app.post('/chat', async (req, res) => {
    try {
        const userMsg = req.body.message;
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // 将系统提示词和用户问题拼接
        const prompt = `${SYSTEM_PROMPT}\n\nUser Question: ${userMsg}`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        res.json({ reply: text });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "AI link failed" });
    }
});

// Render 默认端口是 10000
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
