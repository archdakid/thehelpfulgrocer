import { forwardRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

type InputProps = Omit<TextInputProps, 'className'> & {
  accessibilityLabel: string;
};

const Input = forwardRef<TextInput, InputProps>(function Input(
  { accessibilityLabel, onFocus, onBlur, ...textInputProps },
  ref,
) {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <TextInput
      ref={ref}
      accessibilityLabel={accessibilityLabel}
      placeholderTextColor="rgb(136 135 128)"
      onFocus={(event) => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setIsFocused(false);
        onBlur?.(event);
      }}
      className={`h-11 px-3 rounded-md text-body text-primary bg-surface border-[0.5px] ${
        isFocused ? 'border-brand-primary' : 'border-border'
      }`}
      {...textInputProps}
    />
  );
});

export default Input;
