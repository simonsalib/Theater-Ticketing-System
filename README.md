# 🎟️ Event Tickets - Enterprise-Grade Ticketing Solution

A sophisticated, full-stack event management and ticketing ecosystem engineered with stability and user experience at its core. This project leverages the modern capabilities of **Next.js** and **NestJS** to deliver a seamless, real-time booking experience with precision-engineered seat selection logic.

---

## 🏛️ Technical Architecture

The platform is designed as a modular monorepo, ensuring clear separation of concerns and robust scalability.

### **Frontend Infrastructure** (`frontend-next`)
- **Framework**: [Next.js 16+](https://nextjs.org/) (App Router Architecture)
- **UI Engine**: [React 19](https://react.dev/) with [Tailwind CSS 4](https://tailwindcss.com/)
- **Animation**: [Framer Motion](https://www.framer.com/motion/) for fluid interface transitions
- **State & Logic**: [React Hook Form](https://react-hook-form.com/) & [Zod](https://zod.dev/) for rigorous validation
- **Visualization**: [Recharts](https://recharts.org/) for business analytics

### **Backend Infrastructure** (`backend-nest`)
- **Framework**: [NestJS 11+](https://nestjs.com/) (Node.js Enterprise Framework)
- **Database**: [MongoDB](https://www.mongodb.com/) with [Mongoose ODM](https://mongoosejs.com/)
- **Security**: [Passport.js](http://www.passportjs.org/) & [JWT](https://jwt.io/) for encrypted session management
- **Execution**: [TypeScript](https://www.typescriptlang.org/) for type-safe server-side logic

---

## 🔥 Core Capabilities

### 🎨 Theatrical Engine
- **Infinite Layout Designer**: Build complex theater configurations with an intuitive interface.
- **Sectional Management**: Support for tiered seating, including Balcony and Main Floor views.
- **Dynamic Categorization**: Define Seat types (Standard, VIP, Premium, Wheelchair) with unique pricing.
- **Real-time Availability**: Instant visual feedback on seat occupancy status.

### 🍱 Event Ecosystem
- **Comprehensive Lifecycle**: Manage events from creation through archival.
- **Precision Pricing**: Configure varying price points based on seat categorization.
- **Automated Notifications**: Transactional emails via Nodemailer for booking confirmations.
- **QR Integration**: Seamless ticket verification via generated QR codes.

### 📊 Administrative Suite
- **Granular RBAC**: Role-Based Access Control (Standard User, Organizer, Administrator).
- **Business Intelligence**: Rich analytics dashboards for event performance tracking.
- **User Governance**: Centralized management of platform participants and roles.

---

## 🚀 Deployment & Installation

### **Prerequisites**
- **Runtime**: Node.js 20+ (LTS recommended)
- **Database**: MongoDB instance (Local or Atlas)
- **Package Manager**: npm or yarn

### **Quick Start Guide**

1. **Repository Synchronization**
   ```bash
   git clone https://github.com/Pedro4O4/masr7.git
   cd masr7
   ```

2. **Backend Configuration**
   ```bash
   cd backend-nest
   npm install
   # Configure environment variables (see below)
   npm run start:dev
   ```

3. **Frontend Initialization**
   ```bash
   cd ../frontend-next
   npm install
   npm run dev
   ```

### **Environment Configuration**
Configure the following in `backend-nest/.env`:
```env
MONGODB_URI=mongodb://localhost:27017/event-tickets
JWT_SECRET=[YOUR_SECURE_SECRET]
MAIL_HOST=[SMTP_SERVER]
MAIL_USER=[SMTP_USER]
MAIL_PASS=[SMTP_PASS]
```

---

## 📂 Project Governance

```text
├── backend-nest/          # Enterprise NestJS Server
│   ├── src/
│   │   ├── auth/          # Identity & Access Management
│   │   ├── bookings/      # Transactional Logic
│   │   ├── events/        # Lifecycle Management
│   │   ├── theaters/      # Spatial Configuration
│   │   └── mail/          # Communication Services
│
├── frontend-next/         # Modern Next.js Interface
│   ├── src/
│   │   ├── app/           # High-Performance Routing
│   │   ├── components/    # Atomic UI components
│   │   ├── services/      # API Interfacing Layer
│   │   └── types/         # Domain Models
```

---

## 🛡️ Security Posture
- **JWT Authentication**: Stateless, secure sessions.
- **Bcrypt Hashing**: Industry-standard password encryption.
- **CORS Protection**: Controlled cross-origin resource sharing.
- **Mongoose Validation**: Robust data integrity guards at the database level.

---

## 📝 License & Contact
This project is maintained for educational and professional demonstration purposes.

Built with Precision by **Antigravity** 🚀
