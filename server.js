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

// POST /api/search-employees - Now using Apollo.io
app.post("/api/search-employees", async (req, res) => {
  try {
    const { searchParams } = req.body

    // Use Apollo.io API key from environment variable
    const apiKey = process.env.APOLLO_API_KEY

    if (!apiKey) {
      return res.status(500).json({
        error: "API configuration error",
        details: "Apollo.io API key not configured. Please contact support.",
      })
    }

    // Build Apollo.io search request
    const apolloRequest = {
      // Required: Organization names array
      organization_names: [searchParams.company],

      // Optional filters
      ...(searchParams.jobTitle && { person_titles: [searchParams.jobTitle] }),
      ...(searchParams.location && { organization_locations: [searchParams.location] }),

      // Limit results to save credits
      page: 1,
      per_page: 5, // Small number to conserve credits

      // Request specific fields to ensure we get what we need
      person_titles: searchParams.jobTitle ? [searchParams.jobTitle] : undefined,
    }

    // Remove undefined fields
    Object.keys(apolloRequest).forEach((key) => {
      if (apolloRequest[key] === undefined) {
        delete apolloRequest[key]
      }
    })

    console.log("Apollo.io request:", JSON.stringify(apolloRequest, null, 2))

    const response = await axios.post("https://api.apollo.io/v1/mixed_people/search", apolloRequest, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
    })

    console.log("Apollo.io response status:", response.status)
    console.log("Total people found:", response.data.pagination?.total_entries || 0)
    console.log("People returned:", response.data.people?.length || 0)

    // Log first person's data for debugging
    if (response.data.people && response.data.people.length > 0) {
      console.log("=== FIRST PERSON FROM APOLLO ===")
      const firstPerson = response.data.people[0]
      console.log("Name:", firstPerson.first_name, firstPerson.last_name)
      console.log("Email:", firstPerson.email)
      console.log("Title:", firstPerson.title)
      console.log("LinkedIn:", firstPerson.linkedin_url)
      console.log("Organization:", firstPerson.organization?.name)
    }

    // Transform Apollo.io response to match our frontend expectations
    const transformedData = {
      data:
        response.data.people?.map((person) => ({
          first_name: person.first_name || "",
          last_name: person.last_name || "",
          job_title: person.title || person.headline || "",
          job_company_name: person.organization?.name || searchParams.company,
          linkedin_url: person.linkedin_url || "",
          work_email: person.email || null,
          profile_pic_url: person.photo_url || null,
        })) || [],
      total: response.data.pagination?.total_entries || 0,
      credits_used: response.data.people?.length || 0,
      provider: "Apollo.io",
    }

    console.log("Transformed data:", transformedData.data.length, "people")

    // Log email success rate
    const emailCount = transformedData.data.filter((p) => p.work_email).length
    console.log(`Emails found: ${emailCount}/${transformedData.data.length}`)

    res.json(transformedData)
  } catch (error) {
    console.error("Apollo.io API Error:", error.response?.data || error.message)

    // Handle specific Apollo.io errors
    if (error.response?.status === 401) {
      return res.status(401).json({
        error: "Invalid Apollo.io API key",
        details: "Please check your API key configuration",
      })
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: "Apollo.io rate limit exceeded",
        details: "You've used all your credits. Try again next month or upgrade your plan.",
      })
    }

    if (error.response?.status === 402) {
      return res.status(402).json({
        error: "Apollo.io credits exhausted",
        details: "Your free credits are used up. Upgrade your Apollo.io plan for more searches.",
      })
    }

    res.status(500).json({
      error: "Employee data extraction failed",
      details: error.response?.data?.message || error.message,
    })
  }
})

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    message: "🚀 LinkedIn Employee Data Extractor API is running!",
    provider: "Apollo.io",
    status: "healthy",
    timestamp: new Date().toISOString(),
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`)
  console.log(`🔗 Using Apollo.io API for employee data extraction`)
})
