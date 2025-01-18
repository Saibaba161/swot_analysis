const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express()
const port = process.env.PORT || 8000

// Check for required environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('Error: Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please create a .env file in the root directory with the required variables.');
    process.exit(1);
}

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
    res.sendFile(path.join(__dirname, '../public/login.html'));
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
        
        if (!url) {
            return res.status(400).json({ 
                error: 'Please provide a valid URL to analyze',
                code: 'MISSING_URL'
            });
        }

        // Validate URL format
        try {
            new URL(url);
        } catch (e) {
            return res.status(400).json({ 
                error: 'The provided URL is not properly formatted. Please include http:// or https://',
                code: 'INVALID_URL_FORMAT'
            });
        }

        const analysis = await analyzeSWOT(url);
        res.json(analysis);
    } catch (error) {
        console.error('Analysis error:', error);
        if (error.message.includes('ENOTFOUND')) {
            res.status(404).json({ 
                error: 'Website not found. Please check if the URL is correct and the website is accessible',
                code: 'WEBSITE_NOT_FOUND'
            });
        } else if (error.message.includes('ETIMEDOUT')) {
            res.status(504).json({ 
                error: 'Website took too long to respond. Please try again or try a different website',
                code: 'TIMEOUT'
            });
        } else {
            res.status(500).json({ 
                error: 'Unable to analyze the website. Please try again later',
                code: 'ANALYSIS_FAILED',
                details: error.message
            });
        }
    }
});

async function analyzeSWOT(url) {
    try {
        const response = await axios.get(url, {
            timeout: 10000, // 10 second timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(response.data);

        // Enhanced analysis with more detailed checks
        const analysis = {
            strengths: analyzeStrengths($),
            weaknesses: analyzeWeaknesses($),
            opportunities: analyzeOpportunities($),
            threats: analyzeThreats($)
        };

        return analysis;
    } catch (error) {
        throw new Error(`Failed to analyze the website: ${error.message}`);
    }
}

function analyzeStrengths($) {
    const strengths = [];
    
    // Meta description analysis
    const metaDesc = $('meta[name="description"]').attr('content');
    if (metaDesc) {
        if (metaDesc.length > 120) {
            strengths.push('This website features a comprehensive meta description that effectively communicates the page content to search engines. This detailed description increases the likelihood of better search engine rankings and improves click-through rates from search results.');
        } else if (metaDesc.length > 0) {
            strengths.push('This website includes a meta description, which is good for SEO. However, considering expanding it to provide more context and keywords to potentially improve search engine visibility.');
        }
    }

    // Heading structure
    if ($('h1').length === 1) {
        strengths.push('This page demonstrates proper heading hierarchy with a single H1 tag. This clear structure helps both search engines understand the content hierarchy and assists users with screen readers in navigating the content effectively.');
    } else if ($('h1').length > 1) {
        strengths.push('This page contains multiple H1 headings, which shows rich content sectioning. While this might affect traditional SEO hierarchy, it can be beneficial for HTML5 sectioning where each section could have its own H1.');
    }

    // Image optimization
    const totalImages = $('img').length;
    const imagesWithAlt = $('img[alt]').length;
    if (totalImages > 0 && imagesWithAlt === totalImages) {
        strengths.push('All images on the website are properly optimized with alternative text. This excellent practice not only improves accessibility for users with screen readers but also helps search engines understand the image content, potentially improving the website\'s visibility in image search results.');
    }

    // Mobile responsiveness indicators
    if ($('meta[name="viewport"]').length > 0) {
        strengths.push('This website is configured for mobile responsiveness through proper viewport settings. This ensures optimal viewing experience across different devices and screen sizes, which is crucial for user engagement and meets Google\'s mobile-first indexing requirements.');
    }

    // Social media integration
    if ($('meta[property^="og:"]').length > 0) {
        strengths.push('This website is optimized for social media sharing with Open Graph meta tags. This enhancement ensures the content appears attractively when shared on social platforms, potentially increasing engagement and reach across social networks.');
    }

    return strengths;
}

function analyzeWeaknesses($) {
    const weaknesses = [];

    // Performance indicators
    const scripts = $('script').length;
    if (scripts > 15) {
        weaknesses.push('This website currently loads a significant number of JavaScript files (' + scripts + ' scripts). This high number of scripts could potentially impact the page load time and overall performance. Consider bundling these scripts together or removing unnecessary ones to improve loading speed and user experience.');
    }

    // External dependencies
    const externalLinks = $('a[href^="http"]').length;
    if (externalLinks > 20) {
        weaknesses.push('The page contains ' + externalLinks + ' external links, which is relatively high. While linking to authoritative sources is beneficial, having too many external links might dilute the SEO link equity and could potentially distract users from the core content. Consider reviewing these links and keeping only the most relevant ones.');
    }

    // Content structure
    if ($('h1').length === 0) {
        weaknesses.push('This page is missing a main heading (H1 tag), which is a critical SEO element. Search engines rely heavily on H1 tags to understand the primary topic of the page. Adding a clear, keyword-rich H1 heading would significantly improve the page\'s search engine visibility and content hierarchy.');
    }

    // Image optimization
    const imagesWithoutAlt = $('img:not([alt])').length;
    if (imagesWithoutAlt > 0) {
        weaknesses.push('There are ' + imagesWithoutAlt + ' images on the website lacking alternative text. This oversight affects both accessibility and SEO. Screen readers cannot properly convey image content to visually impaired users, and search engines cannot understand the context of these images. Adding descriptive alt text would improve both accessibility and potential image search rankings.');
    }

    // Form accessibility
    $('form').each((i, form) => {
        const labelsCount = $(form).find('label').length;
        const inputsCount = $(form).find('input').length;
        if (labelsCount < inputsCount) {
            weaknesses.push('Some form fields on the website lack proper label associations. This accessibility issue makes it difficult for screen reader users to understand form inputs and affects the overall user experience. Each input field should have a corresponding label to ensure all users can interact with the forms effectively.');
        }
    });

    return weaknesses;
}

function analyzeOpportunities($) {
    const opportunities = [];

    if ($('link[rel="canonical"]').length === 0) {
        opportunities.push('Consider implementing canonical URLs on the pages. This would help prevent duplicate content issues by clearly indicating the preferred version of the pages to search engines, especially if the content is accessible through multiple URLs.');
    }

    if ($('meta[name="robots"]').length === 0) {
        opportunities.push('Adding a robots meta tag would give you more granular control over how search engines interact with the web pages. This can help you manage crawl behavior and indexing preferences more effectively.');
    }

    opportunities.push(
        'This website could benefit from implementing structured data markup (Schema.org). This would enhance the search result appearances with rich snippets, potentially improving click-through rates and providing more context to search engines about the content.',
        'Consider implementing content compression and browser caching strategies. These performance optimizations could significantly improve page load times and overall user experience, particularly for users on slower connections.',
        'Exploring AMP (Accelerated Mobile Pages) implementation could provide a significant advantage for mobile users. This would ensure extremely fast loading times on mobile devices and could improve the website\'s mobile search rankings.',
        'Implementing comprehensive security headers would enhance the website\'s security posture. This includes HSTS, CSP, and X-Frame-Options headers, which protect against various common web vulnerabilities.'
    );

    return opportunities;
}

function analyzeThreats($) {
    const threats = [
        'The digital landscape is becoming increasingly competitive, with new websites and content being created daily. Staying ahead requires continuous optimization and unique value proposition to maintain and improve the market position.',
        'Search engine algorithms are constantly evolving, with major updates occurring regularly. Keeping up with these changes and maintaining compliance with best practices is crucial for maintaining search visibility.',
        'Web security requirements are becoming more stringent, with users and regulators demanding better protection of user data and privacy. Regular security audits and updates are essential to protect against emerging threats.',
        'The diversity of browsers and devices continues to grow, making cross-browser compatibility more challenging. Regular testing and updates are needed to ensure consistent user experience across all platforms.',
        'Google\'s emphasis on mobile-first indexing means that mobile optimization is no longer optional. Websites must prioritize mobile user experience to maintain search engine rankings.'
    ];

    // Security checks
    if ($('form').length > 0 && $('meta[name="csrf-token"]').length === 0) {
        threats.push('The forms currently lack CSRF protection, which poses a significant security risk. This vulnerability could potentially be exploited by attackers to perform unauthorized actions on behalf of authenticated users. Implementing CSRF tokens is crucial for maintaining form security.');
    }

    if ($('input[type="password"]').length > 0 && !$('meta[name="referrer"]').length) {
        threats.push('Password fields are present without a referrer policy, which could pose a security risk. This might allow sensitive information to leak through referrer headers. Implementing a proper referrer policy is essential for protecting user credentials.');
    }

    return threats;
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
