const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Station Management API',
      version: '1.0.0',
      description: 'API Documentation for Station Management System',
      contact: {
        name: 'Admin'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Nhập token JWT từ response của /api/auth/login'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            full_name: { type: 'string', example: 'Nguyen Van A' },
            email: { type: 'string', example: 'user@example.com' },
            phone: { type: 'string', example: '0912345678' },
            role: { type: 'string', enum: ['USER', 'ADMIN'], example: 'USER' },
            status: { type: 'string', enum: ['ACTIVE', 'LOCKED'], example: 'ACTIVE' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        Station: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Trạm Hà Nội' },
            latitude: { type: 'number', example: 21.0285 },
            longitude: { type: 'number', example: 105.8542 },
            address: { type: 'string', example: 'Quận Hoàn Kiếm, Hà Nội' },
            status: { type: 'string', enum: ['ACTIVE', 'DEPLOYING'], example: 'ACTIVE' },
            description: { type: 'string', example: 'Trạm sạc xe điện' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Proposal: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            user_id: { type: 'integer', example: 1 },
            latitude: { type: 'number', example: 21.0285 },
            longitude: { type: 'number', example: 105.8542 },
            owner_name: { type: 'string', example: 'Nguyen Van A' },
            owner_phone: { type: 'string', example: '0912345678' },
            address: { type: 'string', example: 'Quận Hoàn Kiếm, Hà Nội' },
            area: { type: 'string', example: '100m2' },
            land_type: { type: 'string', example: 'Dân cư' },
            description: { type: 'string', example: 'Vị trí đẹp' },
            status: { type: 'string', enum: ['PENDING', 'REVIEWING', 'APPROVED', 'REJECTED'], example: 'PENDING' },
            created_at: { type: 'string', format: 'date-time' },
            user_name: { type: 'string', example: 'Nguyen Van A' }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 10 },
            total: { type: 'integer', example: 50 },
            totalPages: { type: 'integer', example: 5 }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Lỗi server' }
          }
        }
      }
    },
    tags: [
      { name: 'Test', description: 'Health check endpoints' },
      { name: 'Auth', description: 'Authentication & Registration' },
      { name: 'Stations', description: 'Station management (public read, admin write)' },
      { name: 'Proposals', description: 'Station proposals (public read, auth create)' },
      { name: 'My Proposals', description: 'User own proposals management' },
      { name: 'Admin - Proposals', description: 'Admin proposal management' },
      { name: 'Admin - Users', description: 'Admin user management' },
      { name: 'Admin - Dashboard', description: 'Dashboard statistics' },
      { name: 'Admin - Excel', description: 'Import/Export Excel' },
      { name: 'Map Utils', description: 'Map utility endpoints' }
    ]
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
