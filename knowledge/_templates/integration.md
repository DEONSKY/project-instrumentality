---
id: integration-{{name}}
type: integration
aliases: [{{name}}]
cssclasses: [kb-integration]
app_scope: {{app_scope}}
depends_on: []
owner: {{owner}}
created: {{date}}
---

## Overview

Service: {{service_name}}
Purpose: {{what this integration does}}
Auth: {{api_key|oauth2|webhook_secret|none}}
Base URL: {{base_url_or_env_var_reference}}

## Endpoints used

| method | path | purpose | request | response |
| ------ | ---- | ------- | ------- | -------- |
| {{GET|POST}} | {{/path}} | {{purpose}} | {{shape}} | {{shape}} |

## Events emitted

Domain events this integration triggers within our system.

| event | when | payload |
| ----- | ---- | ------- |
| {{EventName}} | {{trigger}} | {{fields}} |

## Webhooks received

Inbound events from the external service.

| event | endpoint | action |
| ----- | -------- | ------ |
| {{ext_event}} | {{our_endpoint}} | {{what we do}} |

## Error mapping

| external error | our error code | handling |
| -------------- | -------------- | -------- |
| {{ext_code}} | {{OUR_CODE}} | {{retry|surface|ignore}} |

> [!caution] Rate limits
> Requests per second: {{n}}
> Daily cap: {{n}}
> Retry strategy: {{exponential_backoff|none}}

> [!question] Open questions

## Changelog

{{date}} — created
