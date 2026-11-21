# Changes to CodePen's official spec

Written by `npm run spec:pull` each time it saves a new copy of
https://api.codepen.io/openapi.yaml and openapi.json. CodePen publishes no changelog of its own, so
this compares the copies we pulled: changes made between two pulls show up as one entry.

## 2026-11-21

- Added operation `GET /v2/pens/{id}/download/{path}`: Download a file through its signed URL
- `File`: added fields `download_url`
- `File`: now requires `download_url`
- Changed `components.responses.RateLimited.content["application/json"].example.message`
- Changed `components.responses.RateLimited.content["application/json"].example.limit`
- Changed `components.schemas.File.properties.url.description`
- Added `components.schemas.PenCreateRequest.properties.tags.description`
- Added `components.schemas.PenCreateRequest.properties.tags.maxItems`
- Changed `components.schemas.PenUpdateRequest.properties.tags.description`
- Added `components.schemas.PenUpdateRequest.properties.tags.maxItems`
- Added `components.schemas.PenForkRequest.properties.tags.description`
- Added `components.schemas.PenForkRequest.properties.tags.maxItems`

## 2026-10-30

- First copy saved, YAML only.
