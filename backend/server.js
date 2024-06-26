const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express()
const port = process.env.PORT || 3000

const allowedOrigins = process.env.ALLOWED_ORIGINS

app.use(cors({
    origin: function(origin,callback) {
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1) {
            var msg = 'The CORS policy for this site does not allow access from the specified origin'
            return callback(new Error(msg), false)
        }
        return callback(null, true)
    }
}));


app.use(express.json());
app.use(express.static('public'));

app.post('/analyze', async (req, res) => {
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

if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}