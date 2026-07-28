import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateProfileDto, ChangePasswordDto } from './dto/account.dto';
export declare class UsersService {
    private readonly userRepo;
    constructor(userRepo: Repository<User>);
    findById(id: string): Promise<User>;
    findByEmail(email: string): Promise<User | null>;
    findByEmailWithPassword(email: string): Promise<User | null>;
    getProfile(userId: string): Promise<Record<string, unknown>>;
    updateProfile(userId: string, dto: UpdateProfileDto): Promise<Record<string, unknown>>;
    changePassword(userId: string, dto: ChangePasswordDto): Promise<void>;
    private sanitizeUser;
}
