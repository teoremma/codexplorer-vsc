type DataStructure = {
    field1?: string;
    field2?: number;
    field3?: boolean;
    // Add more fields as needed
  };
  
  const createDataStore = (): DataStructure => {
    const target: DataStructure = {};
  
    return new Proxy(target, {
      get(obj, prop: string) {
        if (prop in obj) {
          return obj[prop as keyof DataStructure];
        }
        return undefined; // If field is missing, return `undefined`
      },
      set(obj, prop: string, value) {
        console.log(`Updating ${String(prop)} with value:`, value);
        obj[prop as keyof DataStructure] = value;
        return true;
      }
    });
  };
  
  // Create the proxy data structure
  const data = createDataStore();
  
  // Simulate API calls updating the structure asynchronously
  setTimeout(() => { data.field1 = "Hello"; }, 2000);
  setTimeout(() => { data.field2 = 42; }, 4000);
  setTimeout(() => { data.field3 = true; }, 6000);
  
  // Simulating Part B accessing the structure
  setInterval(() => {
    console.log("Current data:", { ...data });
  }, 500);
  