import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tableName: string;

  @Column()
  recordId: string;

  @Column()
  fieldName: string;

  @Column({ nullable: true })
  oldValue: string;

  @Column({ nullable: true })
  newValue: string;

  @Column()
  userId: string;

  @CreateDateColumn()
  createdAt: Date;
}
