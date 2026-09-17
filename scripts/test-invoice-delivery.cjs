exports.generateInvoicePDF = async () => Buffer.from("synthetic PDF");
exports.sendInvoiceEmail = async () => globalThis.__invoiceTestSend();
exports.getCompanyW9Metadata = async () => ({ objectKey: null });
