import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('documents')
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poId: string;

  @Column({
    type: 'enum',
    enum: [
      'CUSTOMER_PO',
      'APPOINTMENT_CONFIRMATION',
      'INVOICE',
      'DISPATCH_DOCUMENT',
      'DOCKET',
      'POD',
      'GRN',
      'CREDIT_NOTE',
      'DEBIT_NOTE',
      'QR_CODE',
      'RETURN_DOCUMENT',
    ],
  })
  documentType: string;

  @Column()
  fileName: string;

  @Column()
  filePath: string;

  @CreateDateColumn()
  uploadedAt: Date;

  @Column()
  uploadedBy: string;
}
