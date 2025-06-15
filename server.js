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

    // Updated request body with proper field selection for emails
    const requestBody = {
      query: elasticQuery,
      size: 20,
      pretty: true,
      // Request specific fields including email data
      dataset: "phone,email,profile,professional",
      required: "emails AND profiles",
      // Select specific fields to ensure we get email addresses
      select: [
        "first_name",
        "last_name",
        "job_title",
        "job_company_name",
        "linkedin_url",
        "emails",
        "work_email",
        "personal_emails",
        "profiles",
      ],
    }

    const response = await axios.post("https://api.peopledatalabs.com/v5/person/search", requestBody, {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
    })

    console.log("Raw API Response:", JSON.stringify(response.data, null, 2))

    // Transform response to extract actual email addresses
    const transformedData = {
      ...response.data,
      data:
        response.data.data?.map((person) => {
          // Extract actual email from various possible fields
          let workEmail = null

          // Try different email field structures
          if (person.emails && Array.isArray(person.emails) && person.emails.length > 0) {
            // Find work email from emails array
            const workEmailObj = person.emails.find((email) => email.type === "work" || email.type === "professional")
            workEmail = workEmailObj ? workEmailObj.address : person.emails[0].address
          } else if (person.work_email && typeof person.work_email === "string") {
            workEmail = person.work_email
          } else if (
            person.personal_emails &&
            Array.isArray(person.personal_emails) &&
            person.personal_emails.length > 0
          ) {
            workEmail = person.personal_emails[0]
          }

          return {
            ...person,
            work_email: workEmail,
            // Keep original email data for debugging
            original_emails: person.emails,
            email_debug: {
              emails_type: typeof person.emails,
              emails_value: person.emails,
              work_email_type: typeof person.work_email,
              work_email_value: person.work_email,
            },
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
