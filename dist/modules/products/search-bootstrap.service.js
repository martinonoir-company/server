"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SearchBootstrapService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchBootstrapService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
let SearchBootstrapService = SearchBootstrapService_1 = class SearchBootstrapService {
    constructor(dataSource) {
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(SearchBootstrapService_1.name);
    }
    async onModuleInit() {
        try {
            await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        }
        catch (err) {
            this.logger.warn(`Unable to ensure pg_trgm extension: ${err.message}`);
        }
        try {
            await this.dataSource.query(`
        ALTER TABLE products
          ADD COLUMN IF NOT EXISTS search_vector tsvector
            GENERATED ALWAYS AS (
              setweight(to_tsvector('simple'::regconfig, coalesce("name", '')), 'A') ||
              setweight(to_tsvector('simple'::regconfig, coalesce("shortDescription", '')), 'B') ||
              setweight(to_tsvector('simple'::regconfig, coalesce("description", '')), 'C') ||
              setweight(
                to_tsvector(
                  'simple'::regconfig,
                  coalesce(regexp_replace("tags", ',', ' ', 'g'), '')
                ),
                'B'
              )
            ) STORED
      `);
        }
        catch (err) {
            this.logger.warn(`Unable to add products.search_vector column: ${err.message}`);
        }
        try {
            await this.dataSource.query('CREATE INDEX IF NOT EXISTS products_search_vector_gin ON products USING GIN (search_vector)');
        }
        catch (err) {
            this.logger.warn(`Unable to create GIN index on search_vector: ${err.message}`);
        }
        try {
            await this.dataSource.query('CREATE INDEX IF NOT EXISTS products_name_trgm_gin ON products USING GIN (lower("name") gin_trgm_ops)');
        }
        catch (err) {
            this.logger.warn(`Unable to create trigram index on products.name: ${err.message}`);
        }
        this.logger.log('Product search infrastructure verified');
    }
};
exports.SearchBootstrapService = SearchBootstrapService;
exports.SearchBootstrapService = SearchBootstrapService = SearchBootstrapService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], SearchBootstrapService);
//# sourceMappingURL=search-bootstrap.service.js.map