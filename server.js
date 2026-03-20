const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// 只要你在 Render 填了 GEMINI_KEY，这里就能读到
const API_KEY = process.env.GEMINI_KEY;

const systemInstruction = `You are a professional AI assistant for Sam Wu. 
Only answer questions about his resume and professional background. 
Sam's Profile: UofT Math/Stats/CS Student, Logistics Intern, Figure Skating Champion.`;

app.post('/chat', async (req, res) => {
    try {
        if (!API_KEY) {
            return res.json({ reply: "🔴 后端配置错误：环境变量 GEMINI_KEY 为空。" });
        }

        const genAI = new GoogleGenerativeAI(API_KEY);
        
        // 【核心修复】直接改为你指定的 2.5 版本
        // 注意：这里模型名称必须和你之前 Python 项目里跑通的一字不差
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const userMsg = req.body.message;
        const prompt = `${systemInstruction}\n\nUser Question: ${userMsg}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ reply: text });
    } catch (error) {
        console.error("DEBUG ERROR:", error.message);
        // 如果 2.5 还是报 404，后端会在这里把最真实的错误吐给前端气泡
        res.json({ reply: `🔴 2.5版本请求失败。原因: ${error.message}` });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend live on 2.5-flash mode!`));
