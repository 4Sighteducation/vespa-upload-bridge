# VESPA Upload Bridge

Frontend bridging code for the VESPA Upload System integration with Knack. This component provides the user interface for the upload wizard, allowing users to upload staff and student data to the Knack database.

## Overview

The VESPA Upload Bridge provides a multi-step wizard interface for:

- Selecting upload type (staff or student)
- Searching and selecting schools (for super users)
- Uploading CSV files
- Validating data
- Processing uploads
- Viewing results

## Integration with Knack

This component is designed to be loaded by the MultiAppLoader system in the Knack application. It receives configuration data and renders the upload interface in the specified container.

## Installation

### Prerequisites

- Access to the VESPA MultiAppLoader system
- Knack application with appropriate scenes and views
- Deployed instance of the VESPA Upload API

### Setup

1. Host this code on a CDN or GitHub Pages:

```bash
# Clone the repository
git clone https://github.com/4Sighteducation/vespa-upload-bridge.git

# Navigate to the directory
cd vespa-upload-bridge

# Install dependencies (if needed)
npm install

# Build the project (if needed)
npm run build
```

2. Add an entry to the MultiAppLoader.js configuration:

```javascript
const APPS = {
    // ... existing apps ...
    'uploadSystem': {
        scenes: ['scene_1212'], // Replace with your actual scene number
        views: ['view_3020'], // Replace with your actual view number
        scriptUrl: 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-upload-bridge@main/src/index.js',
        configBuilder: (baseConfig, sceneKey, viewKey) => ({
            ...baseConfig,
            appType: 'uploadSystem',
            sceneKey: sceneKey,
            viewKey: viewKey,
            elementSelector: '#view_3020 .kn-rich_text__content', // Selector for the container
            apiUrl: 'https://vespa-upload-api.herokuapp.com/api',
            userRole: 'Staff Admin', // or 'Super User'
            userEmail: Knack.getUserEmail()
        }),
        configGlobalVar: 'VESPA_UPLOAD_CONFIG',
        initializerFunctionName: 'initializeUploadBridge'
    }
};
```

3. Ensure the VESPA Upload API is deployed and accessible.

## Configuration

The bridge component expects the following configuration options:

| Option | Description |
|--------|-------------|
| `elementSelector` | CSS selector for the container element |
| `apiUrl` | URL of the VESPA Upload API |
| `userRole` | Role of the current user ('Staff Admin' or 'Super User') |
| `userEmail` | Email address of the current user |
| `sceneKey` | Knack scene key |
| `viewKey` | Knack view key |

## Usage

The upload wizard guides users through the following steps:

1. **Select Upload Type**: Choose between staff or student data upload
2. **Select School** (Super Users only): Search for and select a school
3. **Upload CSV**: Upload a CSV file with data
4. **Validate Data**: Check the data for errors
5. **Process Upload**: Configure and process the upload
6. **Results**: View upload results and any errors

## Development

### Project Structure

```
vespa-upload-bridge/
├── src/
│   ├── index.js            # Main entry point
│   └── ...                 # Additional files (if needed)
└── README.md
```

### Adding New Features

1. Modify the `src/index.js` file to add new functionality
2. Implement any additional API calls to the VESPA Upload API
3. Add or update styles to maintain consistent appearance
4. Test the integration with the Knack application

## Integration with VESPA Upload API

The bridge component communicates with the VESPA Upload API for:

1. Validating CSV files
2. Processing uploads
3. Retrieving schools (for super users)
4. Downloading templates
5. Retrieving results

## License

Proprietary - © 4Sight Education Ltd
