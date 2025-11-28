<!-- SPDX-License-Identifier: Apache-2.0 -->

# Tazama Services Reference

This document provides a reference guide to the various services in the Tazama ecosystem, including their purposes, repositories, and default ports.

## Table of Contents

- [Overview](#overview)
- [Core Services](#core-services)
- [Authentication and Authorization](#authentication-and-authorization)
- [Related Libraries](#related-libraries)

## Overview

The Tazama ecosystem consists of multiple microservices that work together to provide fraud and risk management capabilities. Each service has a specific responsibility and communicates with other services via NATS messaging.

## Core Services

### Transaction Monitoring Service (TMS)
- **Repository**: `tazama-lf/transaction-monitoring-service`
- **Purpose**: Entry point for transactions into the Tazama system
- **Communication**: Publishes to `event-director` stream

### Event Director
- **Repository**: `tazama-lf/event-director`
- **Purpose**: Routes incoming transactions to appropriate rule processors
- **Communication**: Consumes from `event-director`, publishes to rule processor streams

### Rule Processors
- **Repository Pattern**: `tazama-lf/rule-xxx` (e.g., `rule-001`, `rule-002`, etc.)
- **Purpose**: Execute specific fraud detection rules on transactions
- **Communication**: Consume from `sub-rule-xxx`, publish to `pub-rule-xxx`

### Typology Processor
- **Repository**: `tazama-lf/typology-processor`
- **Purpose**: Aggregates rule results to detect fraud typologies
- **Communication**: Consumes from rule processor streams, publishes to typology streams and interdiction service

### Transaction Aggregation and Decisioning Processor (TADP)
- **Repository**: `tazama-lf/transaction-aggregation-decisioning-processor`
- **Purpose**: Aggregates typology results and makes final fraud decisions
- **Communication**: Consumes from typology streams, publishes to alert service

### Alert Service
- **Repository**: `tazama-lf/alert-service`
- **Purpose**: Sends alerts to external case management systems
- **Communication**: Consumes from TADP stream, sends alerts externally

### Interdiction Service
- **Repository**: `tazama-lf/interdiction-service`
- **Purpose**: Provides real-time transaction blocking capabilities
- **Communication**: Consumes from typology processor, sends blocking decisions

## Authentication and Authorization

### Auth Service
- **Repository**: [`tazama-lf/auth-service`](https://github.com/tazama-lf/auth-service)
- **Purpose**: Handles credential exchange for tokens in Tazama
- **Default Port**: **3020**
- **Functionality**:
  - User authentication (username/password)
  - Token issuance in Tazama format
  - Integration with auth providers (e.g., Keycloak)
- **API Endpoint**: `POST /v1/auth/login`
- **Environment Variables**:
  - `HOST`: Host IP (default: `0.0.0.0`)
  - `PORT`: Service port (default: `3020`)
  - `AUTH_PROVIDER`: Auth provider package name

**Note**: The auth-service handles both authentication and user management functionality, running on port 3020 by default.

### Auth Libraries
- **Repository**: `tazama-lf/auth-lib`
- **Purpose**: Core authentication library
- **Provider Repository**: `tazama-lf/auth-lib-provider-keycloak`
- **Purpose**: Keycloak provider implementation for auth-lib

## Related Libraries

### frms-coe-startup-lib
- **Repository**: `tazama-lf/frms-coe-startup-lib` (current repository)
- **Purpose**: Library for managing NATS message transmission across microservices
- **Key Features**:
  - Service initialization abstractions for NATS
  - Message handling interfaces
  - Configuration management
  - Logging integration

### frms-coe-lib
- **Repository**: `tazama-lf/frms-coe-lib`
- **Purpose**: Core library with shared utilities and protobuf definitions
- **Key Features**:
  - Protobuf message definitions
  - Shared helper functions
  - Common types and interfaces

### Lumberjack
- **Repository**: `tazama-lf/lumberjack`
- **Purpose**: Centralized logging service
- **Functionality**: Subscribes to NATS subject for log messages and routes them to configured destinations

## Service Communication

All services in the Tazama ecosystem communicate through NATS subjects. The typical message flow is:

1. Transaction enters through TMS
2. Event Director routes to appropriate rule processors
3. Rule processors evaluate and publish results
4. Typology Processor aggregates rule results
5. TADP makes final decision
6. Alert Service notifies external systems
7. Interdiction Service blocks transactions if needed

For more details on the message flow and NATS configuration, see the main [README](../README.md).

## References

- [Tazama Documentation](https://github.com/tazama-lf/docs)
- [Auth Service README](https://github.com/tazama-lf/auth-service/blob/dev/README.md)
- [NATS Documentation](https://nats.io)
