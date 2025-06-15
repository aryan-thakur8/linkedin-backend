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

    // MINIMAL request body - exactly as per PDL docs
    const requestBody = {
      query: elasticQuery,
      size: 10, // Reduced to save credits
      pretty: true,
      // NO dataset parameter - to avoid extra charges
      // NO select parameter - to get all available fields including emails
    }

    const response = await axios.post("https://api.peopledatalabs.com/v5/person/search", requestBody, {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
    })

    console.log("Raw API Response Sample:", JSON.stringify(response.data.data?.[0], null, 2))

    // Simple email extraction based on PDL standard response
    const transformedData = {
      ...response.data,
      data:
        response.data.data?.map((person) => {
          // PDL returns emails in different formats:
          // 1. work_email: string (direct work email)
          // 2. emails: array of {address: string, type: string}
          // 3. Sometimes just email: string

          let workEmail = null

          // Priority order for email extraction
          if (person.work_email && typeof person.work_email === "string" && person.work_email !== "true") {
            workEmail = person.work_email
          } else if (person.emails && Array.isArray(person.emails)) {
            // Find work email from emails array
            const workEmailObj = person.emails.find(
              (email) => email.type === "work" || email.type === "professional" || email.type === "business",
            )
            if (workEmailObj && workEmailObj.address) {
              workEmail = workEmailObj.address
            } else if (person.emails[0] && person.emails[0].address) {
              workEmail = person.emails[0].address // Use first email as fallback
            }
          } else if (person.email && typeof person.email === "string" && person.email !== "true") {
            workEmail = person.email
          }

          return {
            first_name: person.first_name,
            last_name: person.last_name,
            job_title: person.job_title,
            job_company_name: person.job_company_name,
            linkedin_url: person.linkedin_url,
            work_email: workEmail,
            profile_pic_url: person.profile_pic_url,
          }
        }) || [],
    }

    res.json(transformedData)
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
