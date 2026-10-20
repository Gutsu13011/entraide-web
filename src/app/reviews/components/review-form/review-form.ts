import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ReviewStore } from '../../services/review-store';
import { Review } from '../../../models/review.model';
import { finalize } from 'rxjs';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-review-form',
  styleUrl: './review-form.scss',
  templateUrl: './review-form.html',
})
export class ReviewForm {
  private readonly reviewStore = inject(ReviewStore);

  readonly serviceProviderId = input.required<number>();
  readonly serviceRequestId = input.required<number>();
  readonly reviewForm = new FormGroup({
    rating: new FormControl(5, {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[1-5]$/)],
    }),
    comment: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
  });
  readonly isSubmitting = signal<boolean>(false);
  readonly submitError = signal<string | null>(null);
  readonly reviewCreated = output<Review>();
  readonly reviewCancelled = output<void>();

  onSubmit(): void {
    if (this.isSubmitting()) {
      return;
    }

    if (this.reviewForm.invalid) {
      this.reviewForm.markAllAsTouched();
      return;
    }

    const formValues = this.reviewForm.getRawValue();

    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.reviewStore
      .add(this.serviceProviderId(), {
        ...formValues,
        serviceRequestId: this.serviceRequestId(),
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (review) => {
          this.reviewCreated.emit(review);
        },
        error: () => {
          this.submitError.set('Impossible de publier votre avis. Veuillez réessayer.');
        },
      });
  }

  onCancel(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.reviewCancelled.emit();
  }
}
