---
layout: base.njk
title: "CandidPartners → McKinsey (2020–2021)"
description: DevOps engineering for a large payment processor and a federal reserve bank, including cross-region CloudFront optimization and serverless log analytics.
---

# CandidPartners → McKinsey (2020–2021)

I joined CandidPartners in May 2020, embedded in an existing DevOps team at **Repay.com**, a large credit card processing company. On January 1, 2021, McKinsey acquired CandidPartners — my role continued without interruption.

## Repay.com — Payment Processing Platform

**Stack:** C# on .NET (not .NET Core) → Windows EC2 via Auto Scaling Groups, MSSQL on RDS (multi-region), CloudFront for static assets.

### CloudFront Geo-Based Load Balancing

In July 2020, CloudFront released [geolocation headers](https://aws.amazon.com/about-aws/whats-new/2020/07/cloudfront-geolocation-headers/) — GPS coordinates injected into each request. I modified the existing Edge Lambdas to use the client's longitude to deterministically route requests to either `us-east-1` or `us-west-2`:

```javascript
region = 'us-east-1'
if (longitude < us_meridian) {
    region = 'us-west-2'
}
return region
```

The threshold was stored in an SSM Parameter (`US-Meridian`) for easy tuning. The result: more deterministic load distribution and reduced pressure on the inter-region replication layer during lag events.

### Batch CC Transaction Encryption via Lambda

Built a highly parallelized Lambda function to encrypt recently-cleared credit card transactions as a background task. Rather than one-record-at-a-time (the typical Lambda tutorial model), I used the full 15-minute execution window — encrypting thousands of transactions per invocation, monitoring elapsed time, and committing/closing cleanly at the 14.5-minute mark. Batch processing inside Lambda, essentially.

## Federal Reserve Bank — ELMA

During the CandidPartners engagement, I also served the Federal Reserve Bank, where we built **ELMA** (Enterprise Logging Metrics and Analysis) — a serverless log ingestion product to normalize ~20 different log formats:

- Preprocessing Lambdas ingested and normalized raw logs
- Amazon Kinesis Stream + Kinesis Firehose wrote data to an AWS Glue database (S3-backed)
- AWS QuickSight enabled all users to query all log types as a unified SQL table

[&larr; Back to Work](/work/)
