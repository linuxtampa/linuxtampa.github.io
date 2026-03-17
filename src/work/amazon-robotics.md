---
layout: base.njk
title: Case Study 1
description: Example case study
---

# Case Study: Legacy Codebase Migration for Amazon Robotics

## Overview

Amazon Robotics needed to modernize their infrastructure by migrating legacy codebases to AWS while maintaining zero downtime. The project involved migrating TypeScript, Golang, and Java applications, upgrading database infrastructure, and implementing modern deployment practices.

**Client:** Amazon Robotics, Toronto, Canada  
**Project Duration:** 1 year (July 2024 - July 2025)  
**Technologies Used:** AWS CDK, TypeScript, Golang, Java, AWS Lambda, Amazon Aurora, RDS

## Challenge

The client was running critical robotics applications on legacy infrastructure with several challenges:
- Multiple legacy codebases in TypeScript, Golang, and Java requiring migration
- Need for zero-downtime migration to avoid disrupting operations
- Outdated database infrastructure (Aurora/MySQL 5.7) limiting performance and scalability
- Manual deployment processes slowing down development velocity
- Looming financial penalty in staying on old RDS Engine versions


The migration needed to be completed without disrupting daily operations, and the infrastructure needed to support future growth and scalability requirements.

## Solution

I executed a comprehensive migration strategy:

1. **Infrastructure as Code:** Used AWS CDK construct library and internal Amazon build tools to orchestrate infrastructure deployments, ensuring reproducibility and version control

2. **Phased Migration:** Planned, coded, tested, and executed migrations of legacy codebases in stages, starting with lower-risk components to validate the approach, and to limit risk until I reach full technical fluency with the pipeline environment

3. **Database Modernization:** Upgraded RDS cluster engines from Aurora/MySQL 5.7 to 8.0, improving performance, scalability, and reducing costs

4. **Zero-Downtime Strategy:** Implemented blue-green deployment patterns and careful migration sequencing to ensure continuous availability

5. **Performance Optimization:** Made additional improvements to increase throughput, fix bugs, and optimize costs throughout the migration process.  Right-sized instance sizes using historical usage data.  Along the way, I found that MySQL 8 is much stricter about literal timestamp patterns than MySQL 5.  Several Lambdas required additional changes when constructing WHERE clauses involving time ranges.

6. **Automation:** Leveraaged existing deployment pipelines to ensure a these deployments were as smooth as routine deployments.

## Results

- **Zero downtime** achieved during the entire migration process
- **Improved scalability** through database engine upgrades and infrastructure modernization
- **Reduced costs** through RDS cluster optimization and infrastructure efficiency improvements
- **Enhanced throughput** and performance for critical robotics applications
- **Faster deployments** through automated CI/CD processes
- **Future-ready infrastructure** that supports continued growth and development

The Warehouse Fulfillment applications now has a modern, scalable AWS infrastructure that supports their operations with improved performance, reliability, and cost efficiency.

