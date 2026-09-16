# Luma Realtime Chat Application

Luma is a full-stack realtime chat application built with a **modular monolith backend**.

The Spring Boot backend owns the business logic and runs as a single application, while the React client is a separate SPA communicating through REST APIs and STOMP/WebSocket.

This repository serves as the system-level entry point and includes the backend and frontend repositories as Git submodules.

## Repositories

| Module | Technology | Repository |
| --- | --- | --- |
| `backend` | Java 21, Spring Boot, Spring Security, JPA, MySQL, Redis, Flyway, STOMP, Cloudinary | [realtime-chat-server](https://github.com/tranverse/realtime-chat-server) |
| `frontend` | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, STOMP | [realtime-chat-client](https://github.com/tranverse/realtime-chat-client) |

## Features

- Email registration with OTP, login, password recovery, and refresh-token rotation
- Google OAuth2 with short-lived, single-use token exchange
- Private and group conversations with roles, ownership transfer, invitations, and join requests
- Realtime text and multi-image messaging with replies, editing, soft deletion, and typing indicators
- `Sent` and `Seen` read receipts with reconnect synchronization
- Authenticated image uploads through the backend to Cloudinary
- Multi-device session management and token revocation
- Responsive React interface with conversation filters, notifications, and isolated chat scrolling

## Architecture

```mermaid
%%{init: {"flowchart": {"curve": "linear"}, "theme": "neutral"}}%%
flowchart LR

    CLIENT["React + TypeScript SPA"]

    subgraph BACKEND["Spring Boot Modular Monolith"]
        direction LR

        INTERFACE["Interface Layer<br/><br/>REST Controllers<br/>STOMP / WebSocket Endpoints<br/>Spring Security"]

        APPLICATION["Application Layer<br/><br/>Authentication · Users<br/>Conversations · Messaging<br/>Media"]

        PERSISTENCE["Persistence Layer<br/><br/>Spring Data JPA<br/>Repositories"]

        INTERFACE --> APPLICATION
        APPLICATION --> PERSISTENCE
    end

    DATABASE[("MySQL")]

    CLIENT -->|"REST / STOMP"| INTERFACE
    PERSISTENCE --> DATABASE
```

### Supporting Infrastructure

| Component | Responsibility |
| --- | --- |
| **Redis** | Rate limiting and temporary state |
| **Cloudinary** | Image storage |
| **Google OAuth2** | External authentication |
| **Email Service** | OTP and account-related email |

## Screenshots

### Authentication

User authentication with email/password, Google OAuth2, password recovery, and secure JWT-based sessions.

<img width="1917" height="863" alt="image" src="https://github.com/user-attachments/assets/1a888b72-f7c9-446a-a062-30e4fd0cf672" />

### Realtime Messaging

Realtime private messaging with image sharing, delivery status, conversation search, and a responsive chat interface.

<img width="1917" height="871" alt="image" src="https://github.com/user-attachments/assets/0f6ee068-613d-4145-8d7a-28de3f38157d" />

### Conversation Overview

Browse conversations, filter unread and group chats, track unread message counts, and quickly access recent conversations.

<img width="1917" height="871" alt="image" src="https://github.com/user-attachments/assets/f67bf2f6-0908-48f6-9aab-71f7b6d9f564" />

### Create Conversations

Start direct messages or create group conversations by searching and selecting participants.

<img width="1917" height="868" alt="image" src="https://github.com/user-attachments/assets/c696bfd8-94a7-4da0-abe9-55171de666bd" />

### Group Messaging

Realtime group conversations with participant-specific messages, delivery status, and shared media support.

<img width="1917" height="872" alt="image" src="https://github.com/user-attachments/assets/d6afefe6-85e1-4ef4-8042-0a60bacbda00" />

### Group Management

Manage group members, roles, ownership, and expiring invitation links with approval-based access.

<img width="1917" height="863" alt="image" src="https://github.com/user-attachments/assets/b80fd7e3-ccd6-419f-89b8-fd0b58e3141a" />

### Profile & Session Management

Manage profile information, Google-linked accounts, and active sessions with device sign-out and global token revocation.

<img width="1917" height="865" alt="image" src="https://github.com/user-attachments/assets/2b028f1c-bafd-4e72-91e6-93890d9ad46b" />

### Notifications

Unread message notifications with conversation previews and badge counts for quick access to new activity.

<img width="522" height="870" alt="image" src="https://github.com/user-attachments/assets/7352322e-9dd0-4a53-b6bc-e28186449482" />

## Clone

Clone the repository together with its submodules:

```bash
git clone --recurse-submodules https://github.com/tranverse/realtime-chat-application.git
cd realtime-chat-application
```

For an existing clone:

```bash
git submodule update --init --recursive
```

## Run Locally

### Backend

Copy:

```text
backend/.env.example
```

to:

```text
backend/.env
```

Configure the required MySQL, Redis, mail, Google OAuth2, JWT, and Cloudinary credentials.

Then run:

```bash
cd backend
./mvnw spring-boot:run
```

On Windows:

```bash
cd backend
mvnw.cmd spring-boot:run
```

The backend runs at:

```text
http://localhost:8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at:

```text
http://localhost:5173
```

During development, the frontend proxies API, OAuth2, and WebSocket traffic to the Spring Boot backend.

## Verification

### Backend

```bash
cd backend
./mvnw test
```

### Frontend

```bash
cd frontend
npm run lint
npm test
npm run build
```

Current verified baseline:

**18 backend tests · 23 frontend tests · All passing**

For implementation details, API documentation, architecture decisions, and testing notes, see the `README.md` and `docs/` directory inside each submodule.
