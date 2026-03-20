const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// 增加一行日志，方便你在 Render 的 Logs 频道看有没有连上
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

const SYSTEM_PROMPT = `You are Sam Wu's professional AI assistant. 
Data: UofT Math/Stats/CS student, Logistics Intern, Microsoft JS Certified.
Answer only about Sam Wu.`;

app.post('/chat', async (req, res) => {
    try {
        const userMsg = req.body.message;
        
        // 尝试使用 gemini-1.5-flash，如果你的 Key 报错，后端会自动尝试切换
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `${SYSTEM_PROMPT}\n\nUser Question: ${userMsg}`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ reply: text });
    } catch (error) {
        // 【核心改进】如果报错，把报错详情打印出来传给前端，咱们当场抓包
        console.error("AI Error Detail:", error.message);
        res.json({ reply: "🔴 后端连接 Google 失败: " + error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));
