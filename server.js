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

// POST /api/search-employees - Using Apollo.io contacts/search
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

    // Build Apollo.io contacts search request (different format)
    const apolloRequest = {
      // Use q parameter for general search
      q: `${searchParams.company}${searchParams.jobTitle ? ` ${searchParams.jobTitle}` : ""}`,

      // Alternative: try organization filter if available
      organization_names: [searchParams.company],

      // Limit results to save credits
      page: 1,
      per_page: 5,
    }

    console.log("Apollo.io contacts/search request:", JSON.stringify(apolloRequest, null, 2))

    // Try contacts/search endpoint instead
    const response = await axios.post("https://api.apollo.io/v1/contacts/search", apolloRequest, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
    })

    console.log("Apollo.io response status:", response.status)
    console.log("Total contacts found:", response.data.pagination?.total_entries || 0)
    console.log("Contacts returned:", response.data.contacts?.length || 0)

    // Log first contact's data for debugging
    if (response.data.contacts && response.data.contacts.length > 0) {
      console.log("=== FIRST CONTACT FROM APOLLO ===")
      const firstContact = response.data.contacts[0]
      console.log("Name:", firstContact.first_name, firstContact.last_name)
      console.log("Email:", firstContact.email)
      console.log("Title:", firstContact.title)
      console.log("LinkedIn:", firstContact.linkedin_url)
      console.log("Organization:", firstContact.organization?.name)
    }

    // Transform Apollo.io contacts response to match our frontend expectations
    const transformedData = {
      data:
        response.data.contacts?.map((contact) => ({
          first_name: contact.first_name || "",
          last_name: contact.last_name || "",
          job_title: contact.title || contact.headline || "",
          job_company_name: contact.organization?.name || searchParams.company,
          linkedin_url: contact.linkedin_url || "",
          work_email: contact.email || null,
          profile_pic_url: contact.photo_url || null,
        })) || [],
      total: response.data.pagination?.total_entries || 0,
      credits_used: response.data.contacts?.length || 0,
      provider: "Apollo.io (Contacts Search)",
    }

    console.log("Transformed data:", transformedData.data.length, "contacts")

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

    if (error.response?.status === 403) {
      return res.status(403).json({
        error: "Apollo.io API access denied",
        details: "Your API key doesn't have access to this endpoint. Try upgrading your Apollo.io plan.",
      })
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: "Apollo.io rate limit exceeded",
        details: "You've used all your credits. Try again next month or upgrade your plan.",
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
    provider: "Apollo.io (Contacts Search)",
    status: "healthy",
    timestamp: new Date().toISOString(),
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`)
  console.log(`🔗 Using Apollo.io Contacts Search API for employee data extraction`)
})
