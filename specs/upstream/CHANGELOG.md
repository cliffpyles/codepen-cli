# Changes to CodePen's official spec

Written by `npm run spec:pull` each time it saves a new copy of
https://api.codepen.io/openapi.yaml and openapi.json. CodePen publishes no changelog of its own, so
this compares the copies we pulled: changes made between two pulls show up as one entry.

## 2026-11-21

<!-- copies: e2f8f45449cd8d1a3e1ea04d2560a90fd394f72f74d343b38d1f029d584b2774 44c499358e88ee64c8c8bd59c83aaa02b8184af4e6a189d1e86b4b37b8c49590 -->

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
