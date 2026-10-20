import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReviewForm } from './review-form';
import { ReviewStore } from '../../services/review-store';
import type { Review } from '../../../models/review.model';
import { Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

describe('ReviewForm', () => {
  let fixture: ComponentFixture<ReviewForm>;
  let component: ReviewForm;
  const reviewStoreStub = { add: vi.fn() };

  beforeEach(async () => {
    reviewStoreStub.add.mockReset();
    await TestBed.configureTestingModule({
      imports: [ReviewForm],
      providers: [{ provide: ReviewStore, useValue: reviewStoreStub }],
    }).compileComponents();
    fixture = TestBed.createComponent(ReviewForm);
    fixture.componentRef.setInput('serviceProviderId', 13);
    fixture.componentRef.setInput('serviceRequestId', 41);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should start with a rating of five and an untouched invalid comment', () => {
    expect(component.reviewForm.getRawValue()).toEqual({ rating: 5, comment: '' });
    expect(component.reviewForm.invalid).toBe(true);
    expect(component.reviewForm.controls.comment.hasError('required')).toBe(true);
    expect(component.reviewForm.untouched).toBe(true);
  });

  it.each([1, 5])('should accept an integer rating of %s with a non-blank comment', (rating) => {
    const values = { rating, comment: '  Très bon service.\nMerci !  ' };
    component.reviewForm.setValue(values);

    expect(component.reviewForm.valid).toBe(true);
    expect(component.reviewForm.getRawValue()).toEqual(values);
  });

  it.each([-1, 0, 1.5, 6])('should reject a rating of %s even with a valid comment', (rating) => {
    component.reviewForm.setValue({ rating, comment: 'Service apprécié.' });

    expect(component.reviewForm.invalid).toBe(true);
    expect(component.reviewForm.controls.rating.invalid).toBe(true);
    expect(component.reviewForm.controls.comment.valid).toBe(true);
  });

  it.each(['', ' \t\n '])('should reject an empty or whitespace-only comment %j', (comment) => {
    component.reviewForm.setValue({ rating: 5, comment });

    expect(component.reviewForm.invalid).toBe(true);
    expect(component.reviewForm.controls.comment.invalid).toBe(true);
    expect(component.reviewForm.controls.rating.valid).toBe(true);
  });

  describe('onSubmit', () => {
    const values = { rating: 4, comment: '  Intervention soignée.\nMerci !  ' };
    const savedReview: Review = {
      id: 8,
      authorName: 'Bruno Leroy',
      ...values,
      createdAt: '2026-10-20T12:00:00.000Z',
      serviceProviderId: 13,
    };

    it.each([
      { label: 'an invalid rating', rating: 0, comment: 'Très bon service.' },
      { label: 'a whitespace-only comment', rating: 5, comment: ' \t\n ' },
    ])('should mark the controls touched and stop submission for $label', ({ rating, comment }) => {
      const createdSpy = vi.fn();
      component.reviewCreated.subscribe(createdSpy);
      component.reviewForm.setValue({ rating, comment });

      component.onSubmit();

      expect(component.reviewForm.controls.rating.touched).toBe(true);
      expect(component.reviewForm.controls.comment.touched).toBe(true);
      expect(reviewStoreStub.add).not.toHaveBeenCalled();
      expect(component.isSubmitting()).toBe(false);
      expect(createdSpy).not.toHaveBeenCalled();
    });

    it('should stop submission while another review is being sent', () => {
      component.reviewForm.setValue(values);
      component.isSubmitting.set(true);

      component.onSubmit();

      expect(reviewStoreStub.add).not.toHaveBeenCalled();
      expect(component.isSubmitting()).toBe(true);
    });

    it('should send the form values with the input identifiers and emit only the saved review', () => {
      const response$ = new Subject<Review>();
      const createdSpy = vi.fn();
      component.reviewCreated.subscribe(createdSpy);
      reviewStoreStub.add.mockReturnValue(response$);
      component.reviewForm.setValue(values);
      component.submitError.set('Ancienne erreur');

      component.onSubmit();

      expect(reviewStoreStub.add).toHaveBeenCalledExactlyOnceWith(13, {
        ...values,
        serviceRequestId: 41,
      });
      expect(component.isSubmitting()).toBe(true);
      expect(component.submitError()).toBeNull();
      expect(createdSpy).not.toHaveBeenCalled();

      response$.next(savedReview);

      expect(createdSpy).toHaveBeenCalledExactlyOnceWith(savedReview);
      expect(component.isSubmitting()).toBe(true);
      response$.complete();
      expect(component.isSubmitting()).toBe(false);
    });

    it('should ignore repeated submissions until the pending request completes', () => {
      const response$ = new Subject<Review>();
      const createdSpy = vi.fn();
      component.reviewCreated.subscribe(createdSpy);
      reviewStoreStub.add.mockReturnValue(response$);
      component.reviewForm.setValue(values);

      component.onSubmit();
      component.onSubmit();
      component.onSubmit();

      expect(reviewStoreStub.add).toHaveBeenCalledOnce();
      expect(component.isSubmitting()).toBe(true);
      expect(createdSpy).not.toHaveBeenCalled();

      response$.next(savedReview);
      response$.complete();

      expect(createdSpy).toHaveBeenCalledExactlyOnceWith(savedReview);
      expect(component.isSubmitting()).toBe(false);
    });

    it.each([403, 409])(
      'should preserve the form and show an error without emitting a review after a %s response',
      (status) => {
        const response$ = new Subject<Review>();
        const createdSpy = vi.fn();
        component.reviewCreated.subscribe(createdSpy);
        reviewStoreStub.add.mockReturnValue(response$);
        component.reviewForm.setValue(values);
        component.onSubmit();

        response$.error(new HttpErrorResponse({ status }));

        expect(component.isSubmitting()).toBe(false);
        expect(component.submitError()).toBe(
          'Impossible de publier votre avis. Veuillez réessayer.',
        );
        expect(component.reviewForm.getRawValue()).toEqual(values);
        expect(createdSpy).not.toHaveBeenCalled();
      },
    );

    it('should clear a previous error and allow a successful retry after a temporary server failure', () => {
      const firstResponse$ = new Subject<Review>();
      const secondResponse$ = new Subject<Review>();
      const createdSpy = vi.fn();
      component.reviewCreated.subscribe(createdSpy);
      reviewStoreStub.add.mockReturnValueOnce(firstResponse$).mockReturnValueOnce(secondResponse$);
      component.reviewForm.setValue(values);
      component.onSubmit();
      firstResponse$.error(new HttpErrorResponse({ status: 503 }));
      expect(component.submitError()).not.toBeNull();
      expect(component.isSubmitting()).toBe(false);

      component.onSubmit();

      expect(reviewStoreStub.add).toHaveBeenCalledTimes(2);
      expect(reviewStoreStub.add).toHaveBeenNthCalledWith(2, 13, {
        ...values,
        serviceRequestId: 41,
      });
      expect(component.submitError()).toBeNull();
      expect(component.isSubmitting()).toBe(true);
      expect(createdSpy).not.toHaveBeenCalled();
      secondResponse$.next(savedReview);
      secondResponse$.complete();
      expect(createdSpy).toHaveBeenCalledExactlyOnceWith(savedReview);
      expect(component.isSubmitting()).toBe(false);
    });
  });

  describe('template', () => {
    function element(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function enterComment(value: string) {
      const textarea = element().querySelector('textarea')!;
      textarea.value = value;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function submitForm() {
      element()
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    }

    it('should associate labels with the rating and comment controls and offer the five ratings', () => {
      const select = element().querySelector('select')!;
      const textarea = element().querySelector('textarea')!;

      expect(select.labels?.[0]?.textContent?.trim()).toBe('Note');
      expect(textarea.labels?.[0]?.textContent?.trim()).toBe('Votre commentaire');
      expect(Array.from(select.options, (option) => option.textContent?.trim())).toEqual([
        '1 / 5',
        '2 / 5',
        '3 / 5',
        '4 / 5',
        '5 / 5',
      ]);
      expect(select.selectedIndex).toBe(4);
      expect(element().querySelector('form')!.noValidate).toBe(true);
    });

    it.each([
      {
        label: 'a missing comment',
        rating: 5,
        comment: '',
        message: 'Le commentaire doit contenir du texte',
      },
      {
        label: 'a fractional rating',
        rating: 1.5,
        comment: 'Service apprécié.',
        message: 'Choisissez une note comprise entre 1 et 5',
      },
    ])(
      'should reveal the validation message for $label only after submission',
      ({ rating, comment, message }) => {
        component.reviewForm.setValue({ rating, comment });
        fixture.detectChanges();
        expect(element().querySelector('.field-error')).toBeNull();

        submitForm();

        expect(element().querySelector('.field-error')?.textContent).toContain(message);
        expect(reviewStoreStub.add).not.toHaveBeenCalled();
      },
    );

    it('should submit a numeric rating chosen in the select and reflect the pending request in the button', () => {
      const response$ = new Subject<Review>();
      const createdSpy = vi.fn();
      component.reviewCreated.subscribe(createdSpy);
      reviewStoreStub.add.mockReturnValue(response$);
      const select = element().querySelector('select')!;
      select.selectedIndex = 1;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      enterComment('Prestation correcte.');
      const button = element().querySelector<HTMLButtonElement>('button[type="submit"]')!;

      submitForm();

      expect(reviewStoreStub.add).toHaveBeenCalledExactlyOnceWith(13, {
        rating: 2,
        comment: 'Prestation correcte.',
        serviceRequestId: 41,
      });
      expect(button.disabled).toBe(true);
      expect(button.textContent).toContain('Publication en cours');
      expect(createdSpy).not.toHaveBeenCalled();
      submitForm();
      expect(reviewStoreStub.add).toHaveBeenCalledOnce();
      const savedReview: Review = {
        id: 8,
        authorName: 'Bruno Leroy',
        rating: 2,
        comment: 'Prestation correcte.',
        createdAt: '2026-10-20T12:00:00.000Z',
        serviceProviderId: 13,
      };
      response$.next(savedReview);
      response$.complete();
      fixture.detectChanges();

      expect(createdSpy).toHaveBeenCalledExactlyOnceWith(savedReview);
      expect(button.disabled).toBe(false);
      expect(button.textContent).toContain('Publier mon avis');
    });

    it('should display a server error as an alert while preserving the entered fields', () => {
      const response$ = new Subject<Review>();
      reviewStoreStub.add.mockReturnValue(response$);
      enterComment('Service apprécié.');
      expect(element().querySelector('[role="alert"]')).toBeNull();
      submitForm();

      response$.error(new HttpErrorResponse({ status: 409 }));
      fixture.detectChanges();

      const alert = element().querySelector('[role="alert"]');
      expect(alert?.classList.contains('error-message')).toBe(true);
      expect(alert?.textContent).toContain('Impossible de publier votre avis. Veuillez réessayer.');
      expect(element().querySelector('textarea')?.value).toBe('Service apprécié.');
      expect(component.reviewForm.controls.rating.value).toBe(5);
      expect(element().querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
        false,
      );
    });
  });
});
