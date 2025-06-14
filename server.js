const express = require("express")
const cors = require("cors")
const axios = require("axios")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware - Allow requests from Netlify
app.use(
  cors({
    origin: ["http://localhost:3000", "https://grand-parfait-623dd7.netlify.app", "https://*.netlify.app"],
  }),
)
app.use(express.json())

// POST /api/search-employees
app.post("/api/search-employees", async (req, res) => {
  try {
    const { searchParams } = req.body

    // Use built-in API key from environment variable (People Data Labs)
    const apiKey = process.env.PEOPLEDATALABS_API_KEY

    if (!apiKey) {
      return res.status(500).json({
        error: "API configuration error",
        details: "Please contact support",
      })
    }

    // Build Elasticsearch query for People Data Labs
    const must = []

    if (searchParams.company) {
      must.push({
        match: {
          job_company_name: searchParams.company,
        },
      })
    }

    if (searchParams.jobTitle) {
      must.push({
        match: {
          job_title: searchParams.jobTitle,
        },
      })
    }

    if (searchParams.location) {
      must.push({
        match: {
          location_name: searchParams.location,
        },
      })
    }

    const elasticQuery = {
      bool: {
        must: must,
      },
    }

    console.log("Elasticsearch query:", JSON.stringify(elasticQuery, null, 2))

    const response = await axios.post(
      "https://api.peopledatalabs.com/v5/person/search",
      {
        query: elasticQuery,
        size: 20,
        pretty: true,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
      },
    )

    res.json(response.data)
  } catch (error) {
    console.error("API Error:", error.response?.data || error.message)
    res.status(500).json({
      error: "Employee data extraction failed",
      details: error.response?.data?.error || error.message,
    })
  }
})

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    message: "🚀 LinkedIn Employee Data Extractor API is running!",
    provider: "People Data Labs",
    status: "healthy",
    timestamp: new Date().toISOString(),
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`)
  console.log(`🔗 Using People Data Labs API for employee data extraction`)
})
