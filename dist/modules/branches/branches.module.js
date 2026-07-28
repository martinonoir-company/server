"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BranchesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const branches_controller_1 = require("./branches.controller");
const branches_service_1 = require("./branches.service");
const branch_entity_1 = require("./entities/branch.entity");
const terminal_entity_1 = require("./entities/terminal.entity");
const user_branch_entity_1 = require("./entities/user-branch.entity");
const user_entity_1 = require("../users/entities/user.entity");
let BranchesModule = class BranchesModule {
};
exports.BranchesModule = BranchesModule;
exports.BranchesModule = BranchesModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([branch_entity_1.Branch, terminal_entity_1.Terminal, user_branch_entity_1.UserBranch, user_entity_1.User])],
        controllers: [branches_controller_1.BranchesController],
        providers: [branches_service_1.BranchesService],
        exports: [branches_service_1.BranchesService, typeorm_1.TypeOrmModule],
    })
], BranchesModule);
//# sourceMappingURL=branches.module.js.map