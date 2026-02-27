import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('permissions')
export class PermissionTypeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  resource: string;

  @Column({ length: 50 })
  action: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
