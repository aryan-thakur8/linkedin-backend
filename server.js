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

    // Use built-in API key from environment variable
    const apiKey = process.env.PROXYCURL_API_KEY

    if (!apiKey) {
      return res.status(500).json({
        error: "API configuration error",
        details: "Please contact support",
      })
    }

    // Build query parameters for Proxycurl
    const queryParams = new URLSearchParams()

    if (searchParams.company) {
      queryParams.append("company_name", searchParams.company)
    }

    if (searchParams.jobTitle) {
      queryParams.append("job_title", searchParams.jobTitle)
    }

    if (searchParams.location) {
      queryParams.append("location", searchParams.location)
    }

    // Set default parameters
    queryParams.append("country", "US") // Default to US, can be made configurable
    queryParams.append("enrich_profiles", "enrich") // Get full profile data
    queryParams.append("page_size", "20") // Limit results

    console.log("Proxycurl query params:", queryParams.toString())

    const response = await axios.get(
      `https://nubela.co/proxycurl/api/v2/search/company/employee/?${queryParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    )

    // Transform Proxycurl response to match our frontend expectations
    const transformedData = {
      data:
        response.data.results?.map((employee) => ({
          first_name: employee.first_name,
          last_name: employee.last_name,
          job_title: employee.occupation,
          job_company_name: employee.company,
          linkedin_url: employee.linkedin_profile_url,
          work_email: employee.email || null,
          profile_pic_url: employee.profile_pic_url,
        })) || [],
      total: response.data.total_result_count || 0,
      next_page: response.data.next_page || null,
    }

    res.json(transformedData)
  } catch (error) {
    console.error("Proxycurl API Error:", error.response?.data || error.message)

    // Handle specific Proxycurl errors
    if (error.response?.status === 401) {
      return res.status(500).json({
        error: "API authentication failed",
        details: "Invalid API key configuration",
      })
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        details: "Too many requests. Please try again later.",
      })
    }

    res.status(500).json({
      error: "Employee data extraction failed",
      details: error.response?.data?.detail || error.message,
    })
  }
})

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    message: "🚀 LinkedIn Employee Data Extractor API is running!",
    provider: "Proxycurl",
    status: "healthy",
    timestamp: new Date().toISOString(),
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`)
  console.log(`🔗 Using Proxycurl API for employee data extraction`)
})
