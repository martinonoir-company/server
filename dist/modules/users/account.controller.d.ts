import { UsersService } from './users.service';
import { UpdateProfileDto, ChangePasswordDto } from './dto/account.dto';
import { User } from './entities/user.entity';
export declare class AccountController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getProfile(user: User): Promise<{
        data: Record<string, unknown>;
    }>;
    updateProfile(user: User, dto: UpdateProfileDto): Promise<{
        data: Record<string, unknown>;
    }>;
    changePassword(user: User, dto: ChangePasswordDto): Promise<{
        message: string;
    }>;
}
