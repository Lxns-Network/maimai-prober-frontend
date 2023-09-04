import React, { useState } from 'react';

function useFormInput(initialValue: string) {
  const [value, setValue] = useState<string>(initialValue);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.currentTarget.value);
  };

  return {
    value,
    onChange: handleInputChange,
  };
}

export default useFormInput;