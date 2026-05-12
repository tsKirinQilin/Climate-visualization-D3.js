# Climate Visualization using D3.js

Interactive full-stack web application for analyzing and visualizing global climate data.

---

## Overview

This project transforms complex climate datasets into interactive and intuitive visual insights.

Users can:
- explore global temperature distribution
- analyze long-term trends
- compare countries
- observe seasonal patterns
- detect climate anomalies



## Features

- World Map — temperature distribution by country
- Line Chart — long-term temperature trends
- Bar Chart — ranking of hottest countries
- Radial Chart — monthly temperature patterns
- Anomaly Chart — global climate changes (animated)



## Interactivity

- Country selection (dropdown + map click)
- Year slider
- Month slider
- Play animation (time evolution)
- Compare mode (multi-country analysis)
- Synchronized charts (all views update together)



## Analytics

- Average temperature
- Hottest & coldest countries
- Global warming trend
- Fastest warming / cooling countries
- Decade temperature change



## Architecture

Client-server architecture:

Frontend (D3.js)  
↓  
Backend API (Node.js / Express)  
↓  
Dataset (JSON / CSV)



## Tech Stack

Frontend:
- D3.js
- HTML5
- CSS3

Backend:
- Node.js
- Express.js

Tools:
- GitHub
- Render (deployment)



## API Endpoints

- /api/data — Full dataset
- /api/countries — List of countries
- /api/line-data — Temperature trends
- /api/stats — Average, hottest, coldest
- /api/by-year — Data by year
- /api/monthly-by-year — Filtered monthly data
- /api/insights — Analytical insights



## Data Processing

The backend performs:
- filtering by country / year / month
- grouping data
- calculating averages
- ranking countries
- computing trends



## Compare Mode

Compare two countries across all visualizations:
- line chart comparison
- radial chart comparison
- bar comparison
- analytical summary



## Deployment

The project is deployed on Render - https://cv-2gja.onrender.com/



## Future Improvements

- MongoDB integration
- User authentication
- Additional datasets (CO₂, precipitation)
- Advanced analytics
- Mobile optimization
