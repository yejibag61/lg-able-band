package com.lgableband.config;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

@Configuration
public class DatabaseSchemaInitializer {

	@Bean
	public ApplicationRunner databaseSchemaRunner(ObjectProvider<DataSource> dataSourceProvider) {
		return args -> {
			DataSource dataSource = dataSourceProvider.getIfAvailable();
			if (dataSource == null) {
				return;
			}

			ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
			populator.setContinueOnError(false);
			populator.addScript(new ClassPathResource("db/schema-v1.sql"));
			populator.execute(dataSource);
			migrateDeviceVendorUniqueness(dataSource);
		};
	}

	private void migrateDeviceVendorUniqueness(DataSource dataSource) throws Exception {
		try (Connection connection = dataSource.getConnection()) {
			boolean hasLegacyIndex = false;
			boolean hasUserScopedIndex = false;
			try (ResultSet indexes = connection.getMetaData().getIndexInfo(
				connection.getCatalog(), null, "device", true, false
			)) {
				while (indexes.next()) {
					String indexName = indexes.getString("INDEX_NAME");
					if ("uk_device_vendor_device_id".equalsIgnoreCase(indexName)) {
						hasLegacyIndex = true;
					}
					if ("uk_device_user_vendor_device_id".equalsIgnoreCase(indexName)) {
						hasUserScopedIndex = true;
					}
				}
			}

			try (Statement statement = connection.createStatement()) {
				if (hasLegacyIndex) {
					statement.execute("ALTER TABLE device DROP INDEX uk_device_vendor_device_id");
				}
				if (!hasUserScopedIndex) {
					statement.execute(
						"ALTER TABLE device ADD UNIQUE KEY uk_device_user_vendor_device_id (user_id, vendor_device_id)"
					);
				}
			}
		}
	}
}
