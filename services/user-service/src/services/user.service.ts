import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { compare, hash } from "bcryptjs";
import jwt from "jsonwebtoken";
import { Repository } from "typeorm";
import type { JwtClaims, Role } from "@qoms/shared";
import { ROLES } from "@qoms/shared";
import type { LoginDto, RegisterDto } from "../dto/auth.dto";
import { RoleEntity } from "../entities/role.entity";
import { UserEntity } from "../entities/user.entity";

const DEFAULT_ROLES: Record<Role, string> = {
  student: "Student",
  employee: "University employee",
  dining_admin: "Dining administrator",
  coworking_admin: "Coworking administrator",
  system_admin: "System administrator"
};

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>
  ) {}

  async ensureDefaultRoles(): Promise<void> {
    for (const roleName of ROLES) {
      const exists = await this.roleRepository.findOne({ where: { name: roleName } });
      if (!exists) {
        await this.roleRepository.save({
          name: roleName,
          description: DEFAULT_ROLES[roleName]
        });
      }
    }
  }

  async register(dto: RegisterDto): Promise<{ token: string; user: Record<string, unknown> }> {
    await this.ensureDefaultRoles();
    const existing = await this.userRepository.findOne({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      throw new BadRequestException("Email already registered");
    }

    const passwordHash = await hash(dto.password, 10);
    const user = await this.userRepository.save({
      email: dto.email.toLowerCase(),
      fullName: dto.fullName,
      passwordHash,
      roleName: "student"
    });

    const token = this.signJwt(user);
    return {
      token,
      user: this.toUserResponse(user)
    };
  }

  async login(dto: LoginDto): Promise<{ token: string; user: Record<string, unknown> }> {
    const user = await this.userRepository.findOne({ where: { email: dto.email.toLowerCase() } });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const matches = await compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return {
      token: this.signJwt(user),
      user: this.toUserResponse(user)
    };
  }

  async listUsers(role?: string): Promise<Record<string, unknown>[]> {
    const where = role && ROLES.includes(role as Role) ? { roleName: role as Role } : {};
    const users = await this.userRepository.find({
      where,
      order: {
        createdAt: "ASC"
      }
    });
    return users.map((user) => this.toUserResponse(user));
  }

  async getUserById(id: string): Promise<Record<string, unknown>> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return this.toUserResponse(user);
  }

  async getUserEntity(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async updateRole(id: string, role: Role): Promise<Record<string, unknown>> {
    await this.ensureDefaultRoles();
    const user = await this.getUserEntity(id);
    user.roleName = role;
    const saved = await this.userRepository.save(user);
    return this.toUserResponse(saved);
  }

  signJwt(user: Pick<UserEntity, "id" | "email" | "roleName">): string {
    const secret = process.env.JWT_SECRET ?? "super-secret-jwt-key";
    const claims: JwtClaims = {
      sub: user.id,
      email: user.email,
      role: user.roleName
    };
    return jwt.sign(claims, secret, {
      expiresIn: "7d"
    });
  }

  toUserResponse(user: UserEntity): Record<string, unknown> {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.roleName,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}

