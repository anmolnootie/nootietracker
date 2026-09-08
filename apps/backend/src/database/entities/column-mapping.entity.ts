import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Admin-editable overrides/extensions to the built-in column alias dictionary.
 * `platform` null = applies globally to every platform.
 */
@Entity('column_mappings')
export class ColumnMappingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  platform: string;

  @Column()
  standardField: string;

  @Column()
  rawColumnAlias: string;

  @CreateDateColumn()
  createdAt: Date;
}
