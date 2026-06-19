package com.lgableband.config;

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
		};
	}
}
