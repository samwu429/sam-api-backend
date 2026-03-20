const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// 只要你在 Render 填了 GEMINI_KEY，这里就能读到
const API_KEY = process.env.GEMINI_KEY;

const systemInstruction = `You are a professional AI assistant for Sam Wu. 
Only answer questions about his resume and professional background.`;

app.post('/chat', async (req, res) => {
    try {
        if (!API_KEY) {
            return res.json({ reply: "🔴 后端配置错误：环境变量 GEMINI_KEY 为空，请检查 Render 设置。" });
        }

        const genAI = new GoogleGenerativeAI(API_KEY);
        // 使用最稳妥的模型名称
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const userMsg = req.body.message;
        const prompt = `${systemInstruction}\n\nUser: ${userMsg}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ reply: text });
    } catch (error) {
        // 这行会在 Render 的 Logs 里显示
        console.error("DEBUG ERROR:", error.message);
        
        // 这行会直接传给你的网页气泡，让你看看到底怎么了
        res.json({ reply: `🔴 Google 拒绝了请求。原因: ${error.message}` });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend is running on port ${PORT}`));
