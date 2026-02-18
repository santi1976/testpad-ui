# Deploy to Vercel

This project is configured to deploy to Vercel using serverless functions.

## Prerequisites

1. Account on [Vercel](https://vercel.com)
2. Repository on GitHub with the code

## Deployment Steps

### Option 1: Deploy from GitHub (Recommended)

1. Go to [vercel.com](https://vercel.com) and log in with GitHub
2. Click on "Add New Project"
3. Import your GitHub repository
4. Vercel will automatically detect it's a Vite project
5. **Important**: Configure the following environment variables:
   - `USER_TESTPAD` - System user email
   - `PASSWORD_TESTPAD` - System user password
   - `COMPANY_OID` - Company ID in Testpad
   - `VITE_TESTPAD_API_TOKEN` - Testpad API token (fallback)
6. Click on "Deploy"
7. Your app will be available at `your-project.vercel.app`

### Option 2: Deploy with Vercel CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Login to Vercel:
```bash
vercel login
```

3. From the project root:
```bash
vercel
```

4. Follow the instructions and configure environment variables when prompted.

5. For production:
```bash
vercel --prod
```

## Required Environment Variables

Configure these variables in the Vercel dashboard (Settings > Environment Variables):

- `USER_TESTPAD` - System user for assigning runs and sending emails
- `PASSWORD_TESTPAD` - System user password
- `COMPANY_OID` - Company ID in Testpad
- `VITE_TESTPAD_API_TOKEN` - Testpad API token (fallback for development)

## Serverless Functions Structure

Serverless functions are located in the `api/` folder:

- `api/validate-login.js` - Validate user login (Email + API Token)
- `api/assign-and-send.js` - Assign run and send email
- `api/v1/[...path].js` - Proxy for Testpad API (`/api/v1/*`)

## Important Notes

1. **Stateless between requests**: Each serverless function is independent. Login to Testpad is performed on each request that requires it (like `assign-and-send`).

2. **CORS**: Functions include CORS handling for requests from the frontend.

3. **Automatic build**: Vercel will automatically run `npm run build` and serve static files from `dist/`.

4. **SPA Routing**: The `vercel.json` is configured to serve `index.html` on all routes that are not `/api/*`, allowing React Router to work correctly.

## Troubleshooting

- **Environment variables error**: Make sure you've configured all required variables in the Vercel dashboard.

- **500 error in functions**: Check the logs in the Vercel dashboard to see specific errors.

- **CORS errors**: Functions already include CORS headers, but if you have issues, verify that requests come from the correct domain.
