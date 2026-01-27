# Testpad API

Welcome to the reference manual for the Testpad API.

This manual assumes you know what Testpad is, how the user interface works, and most importantly, what everything is called.

<br>

---
**Initial Access**
<br>
<br>

Please note, for now:

- the API feature has to be enabled, by Testpad Support, to be able to access it at all  
- only account “owner” users can configure API access (i.e. issue access tokens)

<br>

---
**An Evolving API**
<br>
<br>

The API is brand new for Testpad and will be updated in response to feedback from customers.

Please see the [Change Log](/openapi/change-log) for information on what might have changed since you last looked.

Please also see the [Unsupported Capabilities](/openapi/unsupported-capabilities) section for some discussion of what can't be done yet. 

And if you have a scenario or use-case in mind for the API that is not yet supported, please email support@testpad.com.

<br>

---
**Mostly RESTful**
<br>
<br>

The API mostly conforms to RESTful principles.

- HTTP **GET** requests are used to retrieve information.  
- HTTP **POST** requests are used for actions like creating new folders, scripts, tests and test runs, where the server will generally be inventing new IDs for these objects and returning them in the response payload.  
- HTTP **PATCH** requests are used for modifying parts of existing objects, supplying new (replacement) values for a subset of the keys of those objects.  
- Testpad does not currently support HTTP **PUT** requests – the wholesale replacement of objects with a new object.  
- Testpad does not currently support HTTP **DELETE** requests – these are likely to be supported in the future, but we are protecting you and ourselves from accidental data loss for the time being.

To do something with Testpad's API, you need to send a request to one of the API endpoints. These are the URL path that the request is being directed to, and should be thought of as sending a message to the relevant 'owning' object.

For example, a GET request to `/projects/` is to fetch data on all projects.  

Or, a POST request to `/projects/:p/folders` is a create action on that project’s collection of folders, i.e. to create a new folder in the list of folders.

---

## API Server

<br>

**HTTPS only**
<br>
<br>

The API only responds to requests sent securely using HTTPS.

Clients must validate SSL/TLS certificates (including the certificate chain and hostname) to ensure they are communicating with Testpad. Failure to properly validate the certificate exposes your integration to man-in-the-middle attacks, where malicious actors could intercept, modify, or steal your data.

<br>

---
**Domain**
<br>
<br>

Find the API Server at `https://api.testpad.com`.

Note the subdomain is `api` and not your account ID.

<br>

---
**Paths**
<br>
<br>

All API endpoints are hosted on paths that begin with the common prefix `/api/v1/`.  

At some point in the future, if backwards incompatible changes are introduced, these will be introduced at a new version number, e.g. `/api/v2/`.  

However, in general, every attempt will be made to keep changes and new features backwards compatible, and while this holds true, the API will continue to be hosted at `/api/v1/`.




Version: 1.0

## Servers

```
https://api.testpad.com/api/v1
```

## Download OpenAPI description

[Testpad API](https://testpad-api.redocly.app/_bundle/openapi.yaml)

## ◉ Project Endpoints

### Get all projects

 - [GET /projects](https://testpad-api.redocly.app/openapi/project-endpoints/paths/~1projects/get.md): Retrieves a list of all active projects visible to the authenticating API key. Only basic information (name, id, description) is returned per project.

Archived projects are not included.

Look to these endpoints for retrieving information about the folder and script contents of projects:

- GET /projects/:p/folders
- GET /projects/:p/folders/:f

### Get a project

 - [GET /projects/{project_id}](https://testpad-api.redocly.app/openapi/project-endpoints/paths/~1projects~1%7Bproject_id%7D/get.md): Retrieves the basic information about the project specified by project_id.
Project IDs can be found in the app by inspecting the URL or via the API endpoint to Get all projects.

Does not retrieve the script and folder contents of a project.

For project contents, please see:
- GET /projects/:p/folders – for getting all the script and folder contents of a project
- GET /projects/:p/folders/:f – for getting the contents of a particular folder in a project

## ◉ Folder Endpoints

### Get all folders

 - [GET /projects/{project_id}/folders](https://testpad-api.redocly.app/openapi/folder-endpoints/paths/~1projects~1%7Bproject_id%7D~1folders/get.md): Retrieves the complete content tree of folders and scripts contained by the project, project_id.

By default, the returned tree of folders and scripts consists only of their names and IDs. Folder and script objects can be expanded with more details, such as progress statistics, test details and test runs details by using URL parameters as defined below.

For large projects, it is recommended to use the more specific endpoint Get a folder GET /projects/:p/folders/:f to retrieve the contents of just one folder rather than all folders in the project.

Takes Common URL Parameters for controlling the contents of contained objects.

Defaults for common parameters:
- subfolders=all
- scripts=terse
- tests=none
- fields=none
- runs=none
- results=none
- progress=none

### Create a folder

 - [POST /projects/{project_id}/folders](https://testpad-api.redocly.app/openapi/folder-endpoints/paths/~1projects~1%7Bproject_id%7D~1folders/post.md): Creates a new folder at the top level of the project project_id.

The new folder is supplied as a JSON object in the request body supplying only the name of the new folder.

Note: it is not possible to create a new folder together with a new script (or sub-folder) in the same request.
Instead, a first request must be made to create a new folder, and then subsequent requests can be used to populate it with content.

### Get a folder

 - [GET /projects/{project_id}/folders/{folder_id}](https://testpad-api.redocly.app/openapi/folder-endpoints/paths/~1projects~1%7Bproject_id%7D~1folders~1%7Bfolder_id%7D/get.md): Retrieves the basic information and contents of the folder specified by folder_id.

Folder IDs are strings that start with an 'f' followed by an integer. To find a folder ID in the app, click on a folder to open it and inspect the URL.

By default, the returned tree of folders and scripts consists only of their names and IDs. Folder and script objects can be expanded with more details, such as progress statistics, test details and test runs details by using URL parameters as defined below.

In particular, note that the subfolders URL parameter can be used to limit the response to just the folder requested, without also returning the contents of nested sub-folders.

Takes Common URL Parameters for controlling the contents of contained objects.

Defaults for common parameters:
- subfolders=all
- scripts=terse
- tests=none
- fields=none
- runs=none
- results=none
- progress=none

### Modify a folder

 - [PATCH /projects/{project_id}/folders/{folder_id}](https://testpad-api.redocly.app/openapi/folder-endpoints/paths/~1projects~1%7Bproject_id%7D~1folders~1%7Bfolder_id%7D/patch.md): Modifies the name of the folder folder_id in the project project_id.

To modify the contents of a folder, please see:
- Create a sub-folder POST /projects/:p/folders/:f/folders – for creating a new folder within a folder
- Create a script in a folder POST /projects/:p/folders/:f/scripts – for creating a script within a folder

### POST data
name string — The new name of the folder.

### Returns
JSON response payload containing:

folder object — Summary of the modified folder.  
context object — Project and folderPath context.

### Defaults for common parameters
(no common parameters are used).

### Create a sub-folder

 - [POST /projects/{project_id}/folders/{folder_id}/folders](https://testpad-api.redocly.app/openapi/folder-endpoints/paths/~1projects~1%7Bproject_id%7D~1folders~1%7Bfolder_id%7D~1folders/post.md): Creates a new sub-folder of the folder folder_id within the project project_id.

The new folder is supplied as a JSON object in the request body supplying only the name of the new folder.

Note, it is not possible to create a new folder and new script (or sub-folder) contents in the same request. Instead, a first request must be made to create a new folder, and then subsequent requests can be used to populate it with content.

## ◉ Script Endpoints

### Create a script in a project

 - [POST /projects/{project_id}/scripts](https://testpad-api.redocly.app/openapi/script-endpoints/paths/~1projects~1%7Bproject_id%7D~1scripts/post.md): Creates a new script in the top level of the project project_id.

If you want to create a script within a particular folder, please refer to Create a script in a folder POST /projects/:p/folders/:f/script, a nearly identical endpoint but for the specifying which folder to put the script in.

### Create a script in a folder

 - [POST /projects/{project_id}/folders/{folder_id}/scripts](https://testpad-api.redocly.app/openapi/script-endpoints/paths/~1projects~1%7Bproject_id%7D~1folders~1%7Bfolder_id%7D~1scripts/post.md): Creates a new script in the folder folder_id within the project project_id.

The new script is supplied as a JSON object in the request body and can contain tests,
runs, run headers, results and custom fields.

### URL Parameters
insert enum or integer  
Controls where the script will be created within the specified folder.

first (default) — the script is placed at the top of the folder.  
last — the script is placed at the end of the folder.  
as integer, N — the script is placed after the Nth item in the folder.

### POST data
name string — The name of the new script.  
description string (OPTIONAL) — The description for the new script.  
comments string (OPTIONAL) — The report comments for the new script.

tests — See Supplying Test Text.  
fields — Order/visibility/definition of run header fields.  
runs — List of test run objects as defined in Supplying Test Runs.

### Returns
JSON response payload containing:

script object — Summary of the new script.  
context object — Project and folderPath context.

### Defaults for common parameters
(no common parameters are used).

### Get a script

 - [GET /scripts/{script_id}](https://testpad-api.redocly.app/openapi/script-endpoints/paths/~1scripts~1%7Bscript_id%7D/get.md): Retrieves information about the script specified by the script ID, script_id.

Script IDs are integers and are unique across projects. To find the ID of a script via the app, browse to the relevant script and inspect the page URL.

By default, most information about the script is returned, including its tests, fields, run headers and results. Use the common URL Parameters to modify the contents of the response object.

Takes Common URL Parameters for controlling the contents of contained objects.

Defaults for common parameters:
- subfolders (not relevant)
- scripts=full
- tests=full
- fields=full
- runs=full
- results=full
- progress=terse

## ◉ Run Endpoints

### Add a test run

 - [POST /scripts/{script_id}/runs](https://testpad-api.redocly.app/openapi/run-endpoints/paths/~1scripts~1%7Bscript_id%7D~1runs/post.md): Adds a test run to the script script_id.

The test run will be appended to the set of test runs already present.

For now, there’s no API support for creating retests of test runs.

The test run can optionally include test results.

This endpoint cannot be used to create new header fields that have not already been defined for the script.
Any unrecognized header fields will be ignored.

### POST data
The test run is defined by supplying a test run object as defined in Supplying Test Runs.

### Including Results
To include results with the test run, the test run object can include the results field, which has the choice of format defined in Supplying Test Results.

### Returns
JSON response payload containing:

run object — A summary of test run that was created, including its new id field.

### Defaults for common parameters
(no common parameters are used).

## ◉ Note Endpoints

### Get a list of notes at the top-level of a project

 - [GET /projects/{project_id}/notes](https://testpad-api.redocly.app/openapi/note-endpoints/paths/~1projects~1%7Bproject_id%7D~1notes/get.md): Fetches any notes (note items) that sit at the top level of the project.

For notes in specific folders, see GET /projects/:p/folders/:f/notes.

For more description of notes and their representation, see POST /projects/:p/notes.

### Create a note in a project

 - [POST /projects/{project_id}/notes](https://testpad-api.redocly.app/openapi/note-endpoints/paths/~1projects~1%7Bproject_id%7D~1notes/post.md): Creates a new note in the top level of the project project_id.

Notes are text comments displayed beside scripts and folders in the project view,
allowing for additional notes, comments or instructions to be displayed at the
project/folder and folder report levels.

The new note is supplied as a JSON object in the request body with the
contents of the note in the name field. This might seem like an odd
choice of field name, but is used for consistency with the other types of items
found in projects and folders, namely Folders, Scripts and Notes.
All project/folder items have a name field, which is the text displayed in the
project/folder view. As such, the contents of a Note are in fact its displayed "name".

### Get the list of notes in a folder

 - [GET /projects/{project_id}/folders/{folder_id}/notes](https://testpad-api.redocly.app/openapi/note-endpoints/paths/~1projects~1%7Bproject_id%7D~1folders~1%7Bfolder_id%7D~1notes/get.md): Fetches the list of notes within a folder (but not its subfolders).

For notes in the root folder of a project, see GET /projects/:p/notes.

For more description of notes and their representation, see POST /projects/:p/notes.

### Create a note in a folder

 - [POST /projects/{project_id}/folders/{folder_id}/notes](https://testpad-api.redocly.app/openapi/note-endpoints/paths/~1projects~1%7Bproject_id%7D~1folders~1%7Bfolder_id%7D~1notes/post.md): Creates a new note in the folder folder_id within the project project_id.

For more description of notes and their representation, see POST /projects/:p/notes.

### Modify a note

 - [PATCH /projects/{project_id}/notes/{note_id}](https://testpad-api.redocly.app/openapi/note-endpoints/paths/~1projects~1%7Bproject_id%7D~1notes~1%7Bnote_id%7D/patch.md): Modifies the project/folder Note specified by note_id.

The specified note is modified by simply supplying replacement text
contents in the name field of the payload JSON object.

For more description of notes and their representation, see POST /projects/:p/notes.
