import { describe, expect, it, jest } from '@jest/globals';
import '../src/i18n';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { OtpInput } from '../src/components/OtpInput';
import { PinPad } from '../src/components/PinPad';

// Testing Library v14: render and fireEvent are async (React 19 concurrent rendering).

describe('OtpInput', () => {
  it('keeps only digits and at most 6 of them', async () => {
    const onChange = jest.fn();
    await render(<OtpInput value="" onChange={onChange} label="Код из SMS" />);
    await fireEvent.changeText(screen.getByTestId('otp-input'), '12a3 4-5678');
    expect(onChange).toHaveBeenCalledWith('123456');
  });
});

describe('PinPad', () => {
  it('appends digits, deletes, and stops at 4', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(<PinPad value="12" onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('3'));
    expect(onChange).toHaveBeenLastCalledWith('123');
    await fireEvent.press(screen.getByLabelText('Стереть'));
    expect(onChange).toHaveBeenLastCalledWith('1');

    onChange.mockClear();
    await rerender(<PinPad value="1234" onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('5'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the biometric key only when offered', async () => {
    const { rerender } = await render(<PinPad value="" onChange={jest.fn()} />);
    expect(screen.queryByLabelText('Войти по биометрии')).toBeNull();
    const onBiometric = jest.fn();
    await rerender(<PinPad value="" onChange={jest.fn()} onBiometric={onBiometric} />);
    await fireEvent.press(screen.getByLabelText('Войти по биометрии'));
    expect(onBiometric).toHaveBeenCalled();
  });
});
