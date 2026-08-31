import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from '../../database/entities/user.entity';
import { UserRole } from '@po-control-tower/shared';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  async create(data: {
    email: string;
    password: string;
    name: string;
    roles?: UserRole[];
  }): Promise<UserEntity> {
    const existingUser = await this.userRepository.findOneBy({
      email: data.email,
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = this.userRepository.create({
      email: data.email,
      password: hashedPassword,
      name: data.name,
      roles: data.roles || [UserRole.VIEWER],
      isActive: true,
    });

    return this.userRepository.save(user);
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository.findOneBy({ email });
  }

  async findById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll(): Promise<UserEntity[]> {
    return this.userRepository.find({
      where: { isActive: true },
    });
  }

  async updateRoles(userId: string, roles: UserRole[]): Promise<UserEntity> {
    const user = await this.findById(userId);
    user.roles = roles;
    return this.userRepository.save(user);
  }

  async deactivate(userId: string): Promise<UserEntity> {
    const user = await this.findById(userId);
    user.isActive = false;
    return this.userRepository.save(user);
  }

  async activate(userId: string): Promise<UserEntity> {
    const user = await this.findById(userId);
    user.isActive = true;
    return this.userRepository.save(user);
  }
}
