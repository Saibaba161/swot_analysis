const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express()
const port = process.env.PORT || 8000

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8000'],
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Authentication middleware
async function authenticateRequest(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error) throw error;
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Protected route
app.post('/analyze', authenticateRequest, async (req, res) => {
    try {
        const { url } = req.body;
        const analysis = await analyzeSWOT(url);
        res.json(analysis);
    } catch (error) {
        res.status(500).json({ error: 'An error occurred during analysis' });
    }
});

async function analyzeSWOT(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // This is a simplified analysis. In a real-world scenario,
        // you'd want to implement more sophisticated analysis logic.
        const analysis = {
            strengths: [
                $('meta[name="description"]').attr('content') ? 'Has meta description' : 'No meta description',
                $('h1').length > 0 ? 'Has H1 tag' : 'No H1 tag',
                $('img[alt]').length === $('img').length ? 'All images have alt text' : 'Some images missing alt text'
            ],
            weaknesses: [
                $('a[href^="http"]').length > 10 ? 'Many external links' : 'Few external links',
                $('script').length > 10 ? 'Many scripts' : 'Few scripts',
                $('title').text().length > 60 ? 'Title too long' : 'Title length okay'
            ],
            opportunities: [
                'Implement structured data',
                'Improve mobile responsiveness',
                'Enhance content strategy'
            ],
            threats: [
                'Increasing competition in the market',
                'Changing search engine algorithms',
                'Potential security vulnerabilities'
            ]
        };

        return analysis;
    } catch (error) {
        throw new Error('Failed to analyze the website');
    }
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
