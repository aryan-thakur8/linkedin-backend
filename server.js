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

    // CORRECT APPROACH: Use 'required' parameter to only get people WITH emails
    const requestBody = {
      query: elasticQuery,
      size: 3, // Minimum size to save credits
      pretty: true,
      // ONLY return people who have actual work emails (not just boolean flags)
      required: "work_email",
    }

    console.log("Request body:", JSON.stringify(requestBody, null, 2))

    const response = await axios.post("https://api.peopledatalabs.com/v5/person/search", requestBody, {
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
    })

    console.log("=== API RESPONSE STATUS ===")
    console.log("Status:", response.status)
    console.log("Total results:", response.data.total)
    console.log("Results returned:", response.data.data?.length || 0)

    // Log first person's email fields
    if (response.data.data && response.data.data.length > 0) {
      console.log("=== FIRST PERSON EMAIL DATA ===")
      const firstPerson = response.data.data[0]
      console.log("work_email type:", typeof firstPerson.work_email)
      console.log("work_email value:", firstPerson.work_email)
      console.log("emails field:", firstPerson.emails)

      // Check if it's still boolean
      if (firstPerson.work_email === true || firstPerson.work_email === "true") {
        console.log("❌ STILL GETTING BOOLEAN - API KEY LIMITATION")
      } else if (typeof firstPerson.work_email === "string" && firstPerson.work_email.includes("@")) {
        console.log("✅ SUCCESS - GOT ACTUAL EMAIL")
      }
    }

    // Simple email extraction - prioritize work_email if it's a real string
    const transformedData = {
      ...response.data,
      data:
        response.data.data?.map((person, index) => {
          let workEmail = null

          // Check if work_email is an actual email string (not boolean)
          if (
            person.work_email &&
            typeof person.work_email === "string" &&
            person.work_email !== "true" &&
            person.work_email.includes("@")
          ) {
            workEmail = person.work_email
          }
          // Fallback to emails array if available
          else if (person.emails && Array.isArray(person.emails) && person.emails.length > 0) {
            const emailObj = person.emails.find((e) => e.address && e.address.includes("@"))
            if (emailObj) {
              workEmail = emailObj.address
            }
          }

          console.log(`Person ${index + 1}: ${person.first_name} ${person.last_name} - Email: ${workEmail || "NONE"}`)

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

    // Handle specific PDL errors
    if (error.response?.status === 400) {
      return res.status(400).json({
        error: "Invalid search parameters",
        details: error.response.data.error || "Check your search criteria",
      })
    }

    if (error.response?.status === 402) {
      return res.status(402).json({
        error: "Insufficient credits",
        details: "Your PDL account needs more credits for email data",
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
