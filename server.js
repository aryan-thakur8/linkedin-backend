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

// POST /api/search-employees - Back to People Data Labs
app.post("/api/search-employees", async (req, res) => {
  try {
    const { searchParams } = req.body

    // Use People Data Labs API key from environment variable
    const apiKey = process.env.PEOPLEDATALABS_API_KEY

    if (!apiKey) {
      return res.status(500).json({
        error: "API configuration error",
        details: "People Data Labs API key not configured. Please contact support.",
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

    console.log("People Data Labs query:", JSON.stringify(elasticQuery, null, 2))

    // Clean PDL request
    const requestBody = {
      query: elasticQuery,
      size: 10,
      pretty: true,
    }

    const response = await axios.post("https://api.peopledatalabs.com/v5/person/search", requestBody, {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
    })

    console.log("PDL response status:", response.status)
    console.log("Total people found:", response.data.total || 0)
    console.log("People returned:", response.data.data?.length || 0)

    // Transform PDL response - handle boolean emails gracefully
    const transformedData = {
      data:
        response.data.data?.map((person) => {
          // Handle email - if it's boolean true, show "Available (contact for details)"
          let workEmail = null
          if (person.work_email === true) {
            workEmail = "Available (contact for details)"
          } else if (person.work_email && typeof person.work_email === "string") {
            workEmail = person.work_email
          }

          return {
            first_name: person.first_name || "",
            last_name: person.last_name || "",
            job_title: person.job_title || "",
            job_company_name: person.job_company_name || searchParams.company,
            linkedin_url: person.linkedin_url || "",
            work_email: workEmail,
            profile_pic_url: person.profile_pic_url || null,
          }
        }) || [],
      total: response.data.total || 0,
      credits_used: response.data.data?.length || 0,
      provider: "People Data Labs",
    }

    console.log("Transformed data:", transformedData.data.length, "people")

    // Log email status
    const emailCount = transformedData.data.filter((p) => p.work_email).length
    console.log(`Emails found: ${emailCount}/${transformedData.data.length}`)

    res.json(transformedData)
  } catch (error) {
    console.error("People Data Labs API Error:", error.response?.data || error.message)

    // Handle specific PDL errors
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: "Invalid People Data Labs API key",
        details: "Please check your API key configuration",
      })
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: "People Data Labs rate limit exceeded",
        details: "You've used all your credits. Try again later or upgrade your plan.",
      })
    }

    if (error.response?.status === 402) {
      return res.status(402).json({
        error: "People Data Labs credits exhausted",
        details: "Your credits are used up. Upgrade your PDL plan for more searches.",
      })
    }

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
