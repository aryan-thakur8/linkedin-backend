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
      size: 5, // Even smaller to save credits while debugging
      pretty: true,
    }

    const response = await axios.post("https://api.peopledatalabs.com/v5/person/search", requestBody, {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
    })

    // DETAILED DEBUGGING - Log first person's ALL fields
    if (response.data.data && response.data.data.length > 0) {
      console.log("=== FIRST PERSON COMPLETE DATA ===")
      console.log(JSON.stringify(response.data.data[0], null, 2))
      console.log("=== EMAIL FIELDS SPECIFICALLY ===")
      const firstPerson = response.data.data[0]
      console.log("work_email:", firstPerson.work_email)
      console.log("email:", firstPerson.email)
      console.log("emails:", firstPerson.emails)
      console.log("personal_emails:", firstPerson.personal_emails)
      console.log("business_email:", firstPerson.business_email)
      console.log("=== ALL FIELDS CONTAINING 'email' ===")
      Object.keys(firstPerson).forEach((key) => {
        if (key.toLowerCase().includes("email")) {
          console.log(`${key}:`, firstPerson[key])
        }
      })
    }

    // Enhanced email extraction with detailed logging
    const transformedData = {
      ...response.data,
      data:
        response.data.data?.map((person, index) => {
          let workEmail = null
          let emailSource = "none"

          // Check all possible email fields with logging
          if (person.work_email && person.work_email !== true && person.work_email !== "true") {
            workEmail = person.work_email
            emailSource = "work_email"
          } else if (person.email && person.email !== true && person.email !== "true") {
            workEmail = person.email
            emailSource = "email"
          } else if (person.emails && Array.isArray(person.emails) && person.emails.length > 0) {
            // Check emails array
            const workEmailObj = person.emails.find(
              (email) =>
                email.address && (email.type === "work" || email.type === "professional" || email.type === "business"),
            )
            if (workEmailObj) {
              workEmail = workEmailObj.address
              emailSource = "emails_array_work"
            } else if (person.emails[0] && person.emails[0].address) {
              workEmail = person.emails[0].address
              emailSource = "emails_array_first"
            }
          } else if (person.business_email && person.business_email !== true && person.business_email !== "true") {
            workEmail = person.business_email
            emailSource = "business_email"
          } else if (
            person.personal_emails &&
            Array.isArray(person.personal_emails) &&
            person.personal_emails.length > 0
          ) {
            workEmail = person.personal_emails[0]
            emailSource = "personal_emails"
          }

          // Log email extraction for first few people
          if (index < 3) {
            console.log(`Person ${index + 1} - ${person.first_name} ${person.last_name}:`)
            console.log(`  Email found: ${workEmail || "NONE"}`)
            console.log(`  Email source: ${emailSource}`)
          }

          return {
            first_name: person.first_name,
            last_name: person.last_name,
            job_title: person.job_title,
            job_company_name: person.job_company_name,
            linkedin_url: person.linkedin_url,
            work_email: workEmail,
            profile_pic_url: person.profile_pic_url,
            // Add debug info to response
            email_debug: {
              source: emailSource,
              raw_work_email: person.work_email,
              raw_email: person.email,
              raw_emails_array: person.emails,
              has_emails_field: !!person.emails,
              emails_length: person.emails ? person.emails.length : 0,
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
